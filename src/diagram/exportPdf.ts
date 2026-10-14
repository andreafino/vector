import type { Diagram } from "../types/diagram";
import { entityById } from "../data/loadDiagram";
import { computeBounds } from "./geometry";
import { resolveIconUrl } from "./iconCatalog";
import { buildExportableSvg, resolveIconToDataUri } from "./exportSvg";

const API_BASE = import.meta.env.VITE_API_ENDPOINT ?? "http://localhost:7071/api";

export type PdfQuality = "low" | "medium" | "high";

// DPI del diagramma rasterizzato nel PDF: più alto vuol dire meno sgranatura zoommando/stampando, a
// costo di un file più pesante e di un rendering più lento (vedi api/src/pdfExport.ts, stessi valori
// usati anche in electron/pdfExport.cjs).
export const PDF_QUALITY_DPI: Record<PdfQuality, number> = { low: 600, medium: 1200, high: 2400 };

function nameOf(diagram: Diagram, id: string): string {
  return entityById(diagram, id)?.n ?? id;
}

// Genera il PDF del diagramma (diagramma + legenda tecnologie) chiamando il backend: l'SVG inviato è
// già "congelato" (stili risolti, icone inline), indipendente dallo zoom/pan corrente a schermo.
export async function requestDiagramPdf(diagram: Diagram, svgEl: SVGSVGElement, title: string, quality: PdfQuality): Promise<Blob> {
  const { width, height } = computeBounds(diagram);
  const diagramSvg = await buildExportableSvg(svgEl);

  const technologies = await Promise.all(
    diagram.technologies.map(async (t) => ({
      id: t.id,
      g: t.g,
      n: t.n,
      d: t.d,
      mono: t.mono,
      iconDataUri: t.icon ? await resolveIconToDataUri(resolveIconUrl(t.icon)) : undefined,
      entities: t.e.map((id) => nameOf(diagram, id)),
    }))
  );

  const payload = { title, diagramSvg, diagramWidth: width, diagramHeight: height, diagramDpi: PDF_QUALITY_DPI[quality], technologies };

  // Nell'app desktop il rendering avviene nel processo main via IPC (Node locale, nessun server):
  // evita di dipendere da un'Azure Function in esecuzione per testare l'export.
  if (window.vectorDesktop?.exportPdf) {
    const pdfBytes = await window.vectorDesktop.exportPdf(payload);
    return new Blob([pdfBytes], { type: "application/pdf" });
  }

  const res = await fetch(`${API_BASE}/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? `Esportazione PDF non riuscita (HTTP ${res.status}).`);
  }
  return res.blob();
}
