import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { renderDiagramPdf, validateRequestBody, ValidationError, type ExportPdfRequestBody } from "../pdfExport";

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// POST /api/export-pdf — genera il PDF (diagramma + legenda tecnologie) a partire dall'SVG già
// autosufficiente preparato dal frontend (src/diagram/exportPdf.ts). Endpoint stateless senza
// autenticazione: non tocca dati utente né Graph, riceve tutto il necessario nel body.
export async function exportPdf(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  if (request.method === "OPTIONS") return { status: 204, headers: CORS_HEADERS };

  try {
    const body = (await request.json()) as unknown;
    validateRequestBody(body);
    const pdfBytes = await renderDiagramPdf(body as ExportPdfRequestBody);
    const filename = `${((body as ExportPdfRequestBody).title || "diagramma").replace(/[^\w\- ]/g, "").trim() || "diagramma"}.pdf`;
    return {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` },
      body: pdfBytes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    const isValidationError = err instanceof ValidationError;
    if (!isValidationError) context.error("Errore nella generazione del PDF", err);
    return {
      status: isValidationError ? 400 : 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      jsonBody: { error: message },
    };
  }
}

app.http("export-pdf", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "export-pdf",
  handler: exportPdf,
});
