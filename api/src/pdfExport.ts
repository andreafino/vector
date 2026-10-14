import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface ExportPdfTechnology {
  id: string;
  g: string;
  n: string;
  d: string;
  mono?: string;
  iconDataUri?: string;
  entities: string[];
}

export interface ExportPdfRequestBody {
  title: string;
  diagramSvg: string;
  diagramWidth: number;
  diagramHeight: number;
  diagramDpi: number;
  technologies: ExportPdfTechnology[];
}

// Limiti sani per il payload: un diagramma reale resta ben sotto questi valori, servono solo a evitare
// che un payload malformato o malevolo faccia allocare risorse enormi al rendering.
const MIN_DIMENSION = 10;
const MAX_DIMENSION = 20000;
// Corrisponde ai preset Bassa/Media/Alta scelti dall'utente (src/diagram/exportPdf.ts, PDF_QUALITY_DPI).
const MIN_DPI = 72;
const MAX_DPI = 2400;

export class ValidationError extends Error {}

export function validateRequestBody(body: unknown): asserts body is ExportPdfRequestBody {
  if (!body || typeof body !== "object") throw new ValidationError("Corpo della richiesta mancante.");
  const b = body as Record<string, unknown>;
  if (typeof b.diagramSvg !== "string" || !b.diagramSvg.trim()) throw new ValidationError("diagramSvg mancante o vuoto.");
  if (typeof b.diagramWidth !== "number" || b.diagramWidth < MIN_DIMENSION || b.diagramWidth > MAX_DIMENSION) throw new ValidationError("diagramWidth fuori dai limiti consentiti.");
  if (typeof b.diagramHeight !== "number" || b.diagramHeight < MIN_DIMENSION || b.diagramHeight > MAX_DIMENSION) throw new ValidationError("diagramHeight fuori dai limiti consentiti.");
  if (typeof b.diagramDpi !== "number" || b.diagramDpi < MIN_DPI || b.diagramDpi > MAX_DPI) throw new ValidationError("diagramDpi fuori dai limiti consentiti.");
  if (!Array.isArray(b.technologies)) throw new ValidationError("technologies deve essere un array.");
}

// Dimensione fisica della pagina: calcolata dai pixel "CSS" del diagramma (96px = 1 pollice, la
// convenzione standard del browser), indipendente dal DPI di qualità scelto — altrimenti, dato che
// targetWidthPx sotto è pageWidthPt/72*dpi, il dpi si elide nel calcolo e cambiare qualità non avrebbe
// alcun effetto sulla nitidezza reale (bug: così era prima di questo commento).
const CSS_PX_PER_INCH = 96;
// Formato fisico massimo (~A0 orizzontale) oltre il quale si scala per non produrre pagine assurde.
const MAX_PAGE_WIDTH_PT = 3370; // ~A0 lato lungo
const MAX_PAGE_HEIGHT_PT = 2384; // ~A0 lato corto
// Limite di sicurezza sui pixel effettivamente rasterizzati: a DPI molto alti su un diagramma molto
// grande il calcolo sopra darebbe un raster assurdo (decine di migliaia di pixel); questo tetto evita
// di esaurire memoria/tempo di rendering indipendentemente dal DPI richiesto.
const MAX_RASTER_WIDTH_PX = 20000;

function rasterizeSvgToPng(svg: string, targetWidthPx: number): { png: Buffer; width: number; height: number } {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: Math.round(targetWidthPx) } });
  const rendered = resvg.render();
  const png = rendered.asPng();
  const width = rendered.width;
  const height = rendered.height;
  return { png, width, height };
}

async function addDiagramPage(doc: PDFDocument, body: ExportPdfRequestBody): Promise<void> {
  const naturalWidthPt = (body.diagramWidth / CSS_PX_PER_INCH) * 72;
  const naturalHeightPt = (body.diagramHeight / CSS_PX_PER_INCH) * 72;
  const scale = Math.min(1, MAX_PAGE_WIDTH_PT / naturalWidthPt, MAX_PAGE_HEIGHT_PT / naturalHeightPt);
  const pageWidthPt = naturalWidthPt * scale;
  const pageHeightPt = naturalHeightPt * scale;

  const targetWidthPx = Math.min((pageWidthPt / 72) * body.diagramDpi, MAX_RASTER_WIDTH_PX);
  const { png } = rasterizeSvgToPng(body.diagramSvg, targetWidthPx);

  const page = doc.addPage([pageWidthPt, pageHeightPt]);
  const image = await doc.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: pageWidthPt, height: pageHeightPt });
}

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN = 48;
const TITLE_SIZE = 16;
const GROUP_TITLE_SIZE = 12.5;
const BODY_SIZE = 10.5;
const LINE_GAP = 4;
const ICON_SIZE = 28;

function groupByCategory(technologies: ExportPdfTechnology[]): Array<{ name: string; items: ExportPdfTechnology[] }> {
  const order: string[] = [];
  const map = new Map<string, ExportPdfTechnology[]>();
  for (const t of technologies) {
    if (!map.has(t.g)) {
      map.set(t.g, []);
      order.push(t.g);
    }
    map.get(t.g)!.push(t);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
}

// Spezza `text` su più righe che stanno entro `maxWidth`, misurando con il font effettivo invece di
// contare caratteri: altrimenti nomi/descrizioni lunghe (comuni per i testi da chat) straripano oltre
// il margine della pagina.
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

async function addLegendPages(doc: PDFDocument, title: string, technologies: ExportPdfTechnology[]): Promise<void> {
  if (technologies.length === 0) return;

  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = A4_WIDTH_PT - MARGIN * 2;
  const iconTextGap = 10;
  const textWidth = contentWidth - ICON_SIZE - iconTextGap;

  let page: PDFPage = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
  let y = A4_HEIGHT_PT - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      y = A4_HEIGHT_PT - MARGIN;
    }
  };

  page.drawText(`Legenda tecnologie — ${title}`, { x: MARGIN, y: y - TITLE_SIZE, size: TITLE_SIZE, font: boldFont, color: rgb(0.22, 0.18, 0.18) });
  y -= TITLE_SIZE + 20;

  for (const group of groupByCategory(technologies)) {
    ensureSpace(GROUP_TITLE_SIZE + 16);
    page.drawText(group.name.toUpperCase(), { x: MARGIN, y: y - GROUP_TITLE_SIZE, size: GROUP_TITLE_SIZE, font: boldFont, color: rgb(0.7, 0.35, 0.03) });
    y -= GROUP_TITLE_SIZE + 14;

    for (const tech of group.items) {
      const nameLines = wrapText(tech.n, boldFont, BODY_SIZE + 1, textWidth);
      const descLines = tech.d ? wrapText(tech.d, regularFont, BODY_SIZE, textWidth) : [];
      const entitiesLine = tech.entities.length > 0 ? `Entità: ${tech.entities.join(", ")}` : "";
      const entitiesLines = entitiesLine ? wrapText(entitiesLine, regularFont, BODY_SIZE - 0.5, textWidth) : [];
      const blockHeight = Math.max(ICON_SIZE, (nameLines.length + descLines.length + entitiesLines.length) * (BODY_SIZE + LINE_GAP));
      ensureSpace(blockHeight + 14);

      const blockTop = y;
      let icon: Awaited<ReturnType<PDFDocument["embedPng"]>> | undefined;
      if (tech.iconDataUri) {
        try {
          const { png } = rasterizeSvgToPngFromDataUri(tech.iconDataUri);
          icon = await doc.embedPng(png);
        } catch {
          icon = undefined;
        }
      }
      if (icon) {
        page.drawImage(icon, { x: MARGIN, y: blockTop - ICON_SIZE, width: ICON_SIZE, height: ICON_SIZE });
      } else {
        page.drawRectangle({ x: MARGIN, y: blockTop - ICON_SIZE, width: ICON_SIZE, height: ICON_SIZE, borderWidth: 1, borderColor: rgb(0.89, 0.86, 0.84), color: rgb(0.95, 0.94, 0.93) });
        const mono = (tech.mono ?? tech.n.slice(0, 2)).toUpperCase();
        page.drawText(mono, { x: MARGIN + 5, y: blockTop - ICON_SIZE + 9, size: 10, font: boldFont, color: rgb(0.22, 0.18, 0.18) });
      }

      let textY = blockTop;
      const textX = MARGIN + ICON_SIZE + iconTextGap;
      for (const line of nameLines) {
        page.drawText(line, { x: textX, y: textY - (BODY_SIZE + 1), size: BODY_SIZE + 1, font: boldFont, color: rgb(0.22, 0.18, 0.18) });
        textY -= BODY_SIZE + 1 + LINE_GAP;
      }
      for (const line of descLines) {
        page.drawText(line, { x: textX, y: textY - BODY_SIZE, size: BODY_SIZE, font: regularFont, color: rgb(0.46, 0.41, 0.42) });
        textY -= BODY_SIZE + LINE_GAP;
      }
      for (const line of entitiesLines) {
        page.drawText(line, { x: textX, y: textY - (BODY_SIZE - 0.5), size: BODY_SIZE - 0.5, font: regularFont, color: rgb(0.46, 0.41, 0.42) });
        textY -= BODY_SIZE - 0.5 + LINE_GAP;
      }

      y = Math.min(textY, blockTop - ICON_SIZE) - 14;
    }
  }
}

function rasterizeSvgToPngFromDataUri(dataUri: string): { png: Buffer } {
  const match = /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,(.*)$/s.exec(dataUri);
  if (!match) throw new Error("Formato data-URI icona non supportato.");
  const [, isBase64, payload] = match;
  const svg = isBase64 ? Buffer.from(payload, "base64").toString("utf-8") : decodeURIComponent(payload);
  const { png } = rasterizeSvgToPng(svg, ICON_SIZE * 3);
  return { png };
}

export async function renderDiagramPdf(body: ExportPdfRequestBody): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  await addDiagramPage(doc, body);
  await addLegendPages(doc, body.title, body.technologies);
  return doc.save();
}
