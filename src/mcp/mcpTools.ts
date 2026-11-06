import type { Diagram } from "../types/diagram";
import { CHAT_TOOLS, findChatTool } from "../chat/tools";
import { ICON_CATALOG, SEARCHABLE_ICONS } from "../diagram/iconCatalog";
import { useDiagramStore } from "../store/useDiagramStore";
import type { McpToolDescriptor } from "./types";

const ICON_SEARCH_DEFAULT_LIMIT = 40;
const ICON_SEARCH_MAX_LIMIT = 100;

interface ReadTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  read: (input: Record<string, unknown>, diagram: Diagram) => unknown;
}

const READ_TOOLS: ReadTool[] = [
  {
    name: "getDiagram",
    description: "Restituisce il diagramma aperto in Vector completo (bande, entità, collegamenti, flussi, tecnologie, autenticazione) in formato JSON.",
    input_schema: { type: "object", properties: {} },
    read: (_input, diagram) => diagram,
  },
  {
    name: "listEntities",
    description: "Elenca le entità del diagramma con id, nome, contenitore e sottotitolo.",
    input_schema: { type: "object", properties: {} },
    read: (_input, diagram) => diagram.entities.map((e) => ({ id: e.id, n: e.n, band: e.band, sottotitolo: e.s?.[0] ?? null })),
  },
  {
    name: "getEntity",
    description: "Restituisce il dettaglio completo di un'entità, incluse descrizione e dettagli interni.",
    input_schema: {
      type: "object",
      properties: { entityId: { type: "string", description: "Id dell'entità" } },
      required: ["entityId"],
    },
    read: (input, diagram) => {
      const entity = diagram.entities.find((e) => e.id === input.entityId);
      if (!entity) throw new Error(`Nessuna entità con id "${String(input.entityId)}".`);
      return entity;
    },
  },
  {
    name: "listFlows",
    description: "Elenca i flussi del diagramma con id, titolo, gruppo e numero di passi.",
    input_schema: { type: "object", properties: {} },
    read: (_input, diagram) => diagram.flows.map((f) => ({ id: f.id, t: f.t, g: f.g, passi: f.h.length })),
  },
  {
    name: "getFlow",
    description: "Restituisce un flusso completo con i suoi passi numerati (da 1), con nomi delle entità, collegamento, direzione e dettagli.",
    input_schema: {
      type: "object",
      properties: { flowId: { type: "string", description: "Id del flusso" } },
      required: ["flowId"],
    },
    read: (input, diagram) => {
      const flow = diagram.flows.find((f) => f.id === input.flowId);
      if (!flow) throw new Error(`Nessun flusso con id "${String(input.flowId)}".`);
      const name = (id: string) => diagram.entities.find((e) => e.id === id)?.n ?? id;
      return {
        id: flow.id,
        t: flow.t,
        g: flow.g,
        w: flow.w,
        note: flow.note ?? null,
        passi: flow.h.map(([da, a, edgeId, direzione, etichetta, moduli], i) => ({
          passo: i + 1,
          da,
          daNome: name(da),
          a,
          aNome: name(a),
          collegamentoId: edgeId,
          direzione,
          etichetta,
          moduli: moduli ?? [],
        })),
      };
    },
  },
  {
    name: "listIcons",
    description:
      "Cerca nel catalogo delle icone disponibili (servizi Azure, Microsoft 365/Teams/Power Platform, loghi generici) e restituisce id ed etichetta. " +
      "Senza query restituisce le icone curate di base. Usa l'id restituito nei campi 'icona' di addEntity, updateEntity, addTechnology, updateTechnology.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Testo da cercare nell'etichetta o nell'id (almeno 2 caratteri)" },
        limite: { type: "number", description: `Numero massimo di risultati (default ${ICON_SEARCH_DEFAULT_LIMIT}, massimo ${ICON_SEARCH_MAX_LIMIT})` },
      },
    },
    read: (input) => {
      const query = typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
      if (query.length === 0) return { icone: ICON_CATALOG, suggerimento: "Passa 'query' per cercare nel catalogo completo." };
      if (query.length < 2) throw new Error("La ricerca richiede almeno 2 caratteri.");
      const requested = typeof input.limite === "number" ? Math.floor(input.limite) : ICON_SEARCH_DEFAULT_LIMIT;
      const limit = Math.min(Math.max(requested, 1), ICON_SEARCH_MAX_LIMIT);
      const matches = SEARCHABLE_ICONS.filter((icon) => icon.label.toLowerCase().includes(query) || icon.id.toLowerCase().includes(query));
      return { icone: matches.slice(0, limit), totale: matches.length };
    },
  },
];

export function describeMcpTools(): McpToolDescriptor[] {
  const reads = READ_TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema, readOnly: true }));
  const writes = CHAT_TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema, readOnly: false }));
  return [...reads, ...writes];
}

export function runMcpTool(name: string, input: Record<string, unknown>, client: string): unknown {
  const store = useDiagramStore.getState();

  const read = READ_TOOLS.find((t) => t.name === name);
  if (read) return read.read(input, store.diagram);

  const chatTool = findChatTool(name);
  if (!chatTool) throw new Error(`Strumento sconosciuto: ${name}`);

  const command = chatTool.execute(input, store.diagram);
  store.apply(command, { origine: "mcp", autore: client });
  return { ok: true, modifica: command.label, ...command.output };
}
