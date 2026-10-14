// Proprietà SVG che possono dipendere da CSS custom properties (var(--accent) ecc. definite nei temi,
// vedi THEMES in design/Designer.dc.html) o da regole dello stylesheet dell'app: fuori dal DOM del
// browser (lato server) non c'è alcuno stylesheet da cui risolverle, quindi vanno "congelate" come
// valori concreti prima di serializzare.
const RESOLVED_STYLE_PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "color", "stop-color", "opacity", "font-family", "font-weight"] as const;

function freezeComputedStyles(original: Element, clone: Element): void {
  const originalWalker = document.createTreeWalker(original, NodeFilter.SHOW_ELEMENT);
  const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);

  const applyStyle = (src: Element, dst: Element) => {
    const computed = getComputedStyle(src);
    const parts: string[] = [];
    for (const prop of RESOLVED_STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) parts.push(`${prop}:${value}`);
    }
    if (parts.length > 0) dst.setAttribute("style", parts.join(";"));
  };

  applyStyle(original, clone);
  let node = originalWalker.nextNode();
  let cloneNode = cloneWalker.nextNode();
  while (node && cloneNode) {
    applyStyle(node as Element, cloneNode as Element);
    node = originalWalker.nextNode();
    cloneNode = cloneWalker.nextNode();
  }
}

async function urlToDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inlineImageHrefs(svg: SVGSVGElement): Promise<void> {
  const images = Array.from(svg.querySelectorAll("image"));
  const urls = new Set<string>();
  for (const img of images) {
    const href = img.getAttribute("href") ?? img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    if (href && !href.startsWith("data:")) urls.add(href);
  }
  const resolved = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        resolved.set(url, await urlToDataUri(url));
      } catch {
        // Icona non raggiungibile: viene lasciata com'era, il rendering la ignorerà silenziosamente.
      }
    })
  );
  for (const img of images) {
    const href = img.getAttribute("href") ?? img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
    const dataUri = href ? resolved.get(href) : undefined;
    if (dataUri) {
      img.setAttribute("href", dataUri);
      img.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
    }
  }
}

// L'SVG del diagramma è trasparente (il colore che si vede a schermo viene dallo sfondo della pagina
// attorno, non da un rettangolo nell'SVG stesso): senza questo rettangolo il PDF rasterizzato avrebbe
// sempre uno sfondo bianco, indipendentemente dal tema (chiaro/scuro) in uso nell'app.
function prependBackgroundRect(svg: SVGSVGElement): void {
  const viewBox = svg.viewBox.baseVal;
  const color = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#ffffff";
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", String(viewBox.x));
  rect.setAttribute("y", String(viewBox.y));
  rect.setAttribute("width", String(viewBox.width));
  rect.setAttribute("height", String(viewBox.height));
  rect.setAttribute("fill", color);
  svg.insertBefore(rect, svg.firstChild);
}

// Clona l'SVG live del diagramma e lo rende autosufficiente per l'invio al backend: sfondo pieno
// (altrimenti trasparente), stili risolti in valori concreti e icone inlineate come data-URI (niente
// dipendenza da URL raggiungibili lato server).
export async function buildExportableSvg(svgEl: SVGSVGElement): Promise<string> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  freezeComputedStyles(svgEl, clone);
  prependBackgroundRect(clone);
  await inlineImageHrefs(clone);
  return new XMLSerializer().serializeToString(clone);
}

export async function resolveIconToDataUri(url: string): Promise<string | undefined> {
  if (url.startsWith("data:")) return url;
  try {
    return await urlToDataUri(url);
  } catch {
    return undefined;
  }
}
