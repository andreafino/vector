// In SVG non esiste text-overflow: per non far uscire i testi dal rettangolo dell'entità li tronchiamo noi,
// aggiungendo "…". Si misura con un canvas 2D condiviso; dove il canvas non c'è (jsdom nei test) si stima
// la larghezza per carattere.
export interface TextFont {
  size: number;
  weight?: number | string;
  family?: string;
}

const ELLIPSIS = "…";
const FALLBACK_CHAR_WIDTH = 0.55; // frazione del corpo del carattere

let ctx: CanvasRenderingContext2D | null | undefined;

function getContext(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  } catch {
    ctx = null;
  }
  return ctx;
}

function widthOf(text: string, font: TextFont): number {
  const c = getContext();
  if (!c) return text.length * font.size * FALLBACK_CHAR_WIDTH;
  c.font = `${font.weight ?? 400} ${font.size}px ${font.family ?? "'Source Sans 3', sans-serif"}`;
  return c.measureText(text).width;
}

export function fitText(text: string, maxWidth: number, font: TextFont): string {
  if (!text || widthOf(text, font) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  // massimo numero di caratteri che, con i puntini, stanno nella larghezza disponibile
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (widthOf(text.slice(0, mid).trimEnd() + ELLIPSIS, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? ELLIPSIS : text.slice(0, lo).trimEnd() + ELLIPSIS;
}
