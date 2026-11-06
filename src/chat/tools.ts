import type { Diagram, Edge, FlowStepRaw, Technology } from "../types/diagram";
import type { Command } from "../commands/types";
import type { DeletableKind } from "../commands/commands";
import {
  addBand,
  addEdge,
  addEntity,
  addEntityModule,
  addFlow,
  addFlowStep,
  addTechnology,
  deleteBand,
  deleteElement,
  deleteEntityModule,
  deleteFlowStep,
  insertFlowStep,
  moveEntity,
  moveFlowStep,
  updateBand,
  updateEdge,
  updateEntity,
  updateEntityModule,
  updateFlow,
  updateFlowStep,
  updateTechnology,
} from "../commands/commands";
import { directionFor, findEdgesBetween } from "../diagram/flowSteps";
import { DEFAULT_ENTITY_HEIGHT, clampEntityPosition, midpointOfPath, orthogonalEdgePath } from "../diagram/geometry";
import { monogram, slugify, uniqueId } from "../diagram/ids";
import { ICON_CATALOG, SEARCHABLE_ICONS } from "../diagram/iconCatalog";
import { suggestIcon } from "../diagram/iconSuggest";
import type { AnthropicTool } from "./anthropicClient";

export interface ChatTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, diagram: Diagram) => Command;
}

function requireEntity(diagram: Diagram, id: string) {
  const entity = diagram.entities.find((e) => e.id === id);
  if (!entity) throw new Error(`Nessuna entità con id "${id}".`);
  return entity;
}

function requireBand(diagram: Diagram, label: string) {
  const band = diagram.bands.find((b) => b.l === label);
  if (!band) throw new Error(`Nessun contenitore con etichetta "${label}".`);
  return band;
}

function requireModule(diagram: Diagram, entityId: string, moduleId: string) {
  const entity = requireEntity(diagram, entityId);
  const module = entity.mods?.find((m) => m.id === moduleId);
  if (!module) throw new Error(`Nessun dettaglio con id "${moduleId}" nell'entità "${entityId}".`);
  return module;
}

function requireEdge(diagram: Diagram, id: string) {
  const edge = diagram.edges.find((e) => e.id === id);
  if (!edge) throw new Error(`Nessun collegamento con id "${id}".`);
  return edge;
}

// Valida un id icona contro il catalogo curato (ICON_CATALOG) e quello esteso Azure/Microsoft 365/loghi
// (SEARCHABLE_ICONS), così un id inventato fallisce subito con un messaggio utile invece di produrre
// un'icona rotta in silenzio. Usato da addEntity/updateEntity/addTechnology/updateTechnology.
function validateIcon(icon: string | undefined): string | undefined {
  if (!icon) return undefined;
  const known = ICON_CATALOG.some((i) => i.id === icon) || SEARCHABLE_ICONS.some((i) => i.id === icon);
  if (!known) throw new Error(`Icona sconosciuta "${icon}". Usa lo strumento listIcons per cercare un id valido.`);
  return icon;
}

const ICON_PARAM_DESCRIPTION = "Id icona dal catalogo (usa lo strumento listIcons per cercarlo); se omessa si usa un monogramma dal nome";

const toolAddEntity: ChatTool = {
  name: "addEntity",
  description: "Aggiunge una nuova entità (servizio, sistema, componente) a un contenitore esistente del diagramma.",
  input_schema: {
    type: "object",
    properties: {
      nome: { type: "string", description: "Nome dell'entità" },
      banda: { type: "string", description: "Etichetta esatta del contenitore in cui inserirla" },
      sottotitolo: { type: "string", description: "Sottotitolo opzionale" },
      descrizione: { type: "string", description: "Descrizione opzionale" },
      icona: { type: "string", description: ICON_PARAM_DESCRIPTION },
      x: { type: "number", description: "Posizione X opzionale; se omessa viene calcolata in coda al contenitore" },
      y: { type: "number", description: "Posizione Y opzionale; se omessa viene calcolata in coda al contenitore" },
    },
    required: ["nome", "banda"],
  },
  execute(input, diagram) {
    const nome = String(input.nome ?? "").trim();
    const bandaLabel = String(input.banda ?? "");
    if (!nome) throw new Error("Il nome dell'entità non può essere vuoto.");
    const band = requireBand(diagram, bandaLabel);
    // Icona omessa: stessa proposta dal nome che vede chi crea l'entità a mano.
    const icon = validateIcon(typeof input.icona === "string" ? input.icona : undefined) ?? suggestIcon(nome);
    const id = uniqueId(slugify(nome), (candidate) => diagram.entities.some((e) => e.id === candidate));

    let x: number;
    let y: number;
    if (typeof input.x === "number" && typeof input.y === "number") {
      const placed = clampEntityPosition(band, input.x, input.y);
      x = placed.x;
      y = placed.y;
    } else {
      const bottom = diagram.entities
        .filter((e) => e.band === band.l)
        .reduce((max, e) => Math.max(max, e.y + (e.h ?? DEFAULT_ENTITY_HEIGHT)), band.y + 24);
      x = band.x + 24;
      y = bottom + 16;
    }

    const sottotitolo = typeof input.sottotitolo === "string" ? input.sottotitolo.trim() : "";
    const descrizione = typeof input.descrizione === "string" ? input.descrizione.trim() : "";

    return addEntity({
      id,
      n: nome,
      band: band.l,
      x,
      y,
      icon,
      mono: icon ? undefined : monogram(nome),
      s: sottotitolo ? [sottotitolo] : undefined,
      desc: descrizione || undefined,
    });
  },
};

const toolMoveEntity: ChatTool = {
  name: "moveEntity",
  description: "Sposta un'entità esistente a una nuova posizione, eventualmente in un altro contenitore.",
  input_schema: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      banda: { type: "string", description: "Nuovo contenitore, opzionale" },
    },
    required: ["entityId", "x", "y"],
  },
  execute(input, diagram) {
    const entityId = String(input.entityId ?? "");
    requireEntity(diagram, entityId);
    const banda = typeof input.banda === "string" && input.banda ? input.banda : undefined;
    if (banda) requireBand(diagram, banda);
    return moveEntity(entityId, Math.round(Number(input.x)), Math.round(Number(input.y)), banda);
  },
};

const toolAddBand: ChatTool = {
  name: "addBand",
  description: "Aggiunge un nuovo contenitore (banda) al diagramma.",
  input_schema: {
    type: "object",
    properties: {
      etichetta: { type: "string" },
      x: { type: "number", description: "Posizione X opzionale" },
      y: { type: "number", description: "Posizione Y opzionale" },
    },
    required: ["etichetta"],
  },
  execute(input, diagram) {
    const etichetta = String(input.etichetta ?? "").trim();
    if (!etichetta) throw new Error("L'etichetta del contenitore non può essere vuota.");
    let x = typeof input.x === "number" ? input.x : 0;
    let y = typeof input.y === "number" ? input.y : 0;
    if (typeof input.x !== "number" || typeof input.y !== "number") {
      const rightmost = diagram.bands.reduce((max, b) => Math.max(max, b.x + b.w), 0);
      x = rightmost + 60;
      y = 0;
    }
    return addBand({ l: etichetta, x: Math.round(x), y: Math.round(y), w: 280, h: 160 });
  },
};

const toolUpdateBand: ChatTool = {
  name: "updateBand",
  description: "Rinomina o ridimensiona/riposiziona un contenitore esistente. Se ne cambi l'etichetta, le entità al suo interno vengono riassegnate automaticamente.",
  input_schema: {
    type: "object",
    properties: {
      etichetta: { type: "string", description: "Etichetta attuale del contenitore" },
      nuovaEtichetta: { type: "string" },
      x: { type: "number" },
      y: { type: "number" },
      w: { type: "number" },
      h: { type: "number" },
    },
    required: ["etichetta"],
  },
  execute(input, diagram) {
    const etichetta = String(input.etichetta ?? "");
    requireBand(diagram, etichetta);
    const patch: { l?: string; x?: number; y?: number; w?: number; h?: number } = {};
    if (typeof input.nuovaEtichetta === "string" && input.nuovaEtichetta.trim()) patch.l = input.nuovaEtichetta.trim();
    if (typeof input.x === "number") patch.x = Math.round(input.x);
    if (typeof input.y === "number") patch.y = Math.round(input.y);
    if (typeof input.w === "number") patch.w = Math.round(input.w);
    if (typeof input.h === "number") patch.h = Math.round(input.h);
    return updateBand(etichetta, patch);
  },
};

const toolDeleteBand: ChatTool = {
  name: "deleteBand",
  description:
    "Elimina un contenitore INSIEME a tutte le entità che contiene, ai loro collegamenti e ai riferimenti nelle tecnologie. Operazione distruttiva: verifica prima il contenuto con getDiagram o listEntities.",
  input_schema: {
    type: "object",
    properties: { etichetta: { type: "string", description: "Etichetta esatta del contenitore da eliminare" } },
    required: ["etichetta"],
  },
  execute(input, diagram) {
    const etichetta = String(input.etichetta ?? "");
    requireBand(diagram, etichetta);
    return deleteBand(etichetta);
  },
};

const toolAddEdge: ChatTool = {
  name: "addEdge",
  description: "Collega due entità esistenti con una freccia.",
  input_schema: {
    type: "object",
    properties: {
      entityIdA: { type: "string" },
      entityIdB: { type: "string" },
      etichetta: { type: "string" },
      bidirezionale: { type: "boolean" },
    },
    required: ["entityIdA", "entityIdB"],
  },
  execute(input, diagram) {
    const aId = String(input.entityIdA ?? "");
    const bId = String(input.entityIdB ?? "");
    const a = requireEntity(diagram, aId);
    const b = requireEntity(diagram, bId);
    const etichetta = typeof input.etichetta === "string" ? input.etichetta.trim() : "";
    const bidirezionale = input.bidirezionale === true;
    const d = orthogonalEdgePath(a, b);
    const [midX, midY] = midpointOfPath(d);
    const id = uniqueId(`e-${a.id}-${b.id}`, (candidate) => diagram.edges.some((e) => e.id === candidate));
    return addEdge({
      id,
      a: a.id,
      b: b.id,
      d,
      l: etichetta || undefined,
      lx: etichetta ? midX : undefined,
      ly: etichetta ? midY : undefined,
      bi: bidirezionale || undefined,
    });
  },
};

const toolUpdateEdge: ChatTool = {
  name: "updateEdge",
  description: "Modifica l'etichetta o la bidirezionalità di un collegamento esistente.",
  input_schema: {
    type: "object",
    properties: {
      edgeId: { type: "string" },
      etichetta: { type: "string" },
      bidirezionale: { type: "boolean" },
    },
    required: ["edgeId"],
  },
  execute(input, diagram) {
    const edgeId = String(input.edgeId ?? "");
    requireEdge(diagram, edgeId);
    const patch: { l?: string; bi?: boolean } = {};
    if (typeof input.etichetta === "string") patch.l = input.etichetta.trim() || undefined;
    if (typeof input.bidirezionale === "boolean") patch.bi = input.bidirezionale || undefined;
    return updateEdge(edgeId, patch);
  },
};

const toolAddFlow: ChatTool = {
  name: "addFlow",
  description: "Crea un flusso vuoto (senza passi) e restituisce il suo id. Poi aggiungi i passi con addFlowStep.",
  input_schema: {
    type: "object",
    properties: {
      titolo: { type: "string" },
      gruppo: { type: "string" },
      dove: { type: "string", description: "Dove si svolge il flusso (sistemi coinvolti)" },
      nota: { type: "string", description: "Nota opzionale" },
    },
    required: ["titolo", "gruppo", "dove"],
  },
  execute(input, diagram) {
    const titolo = String(input.titolo ?? "").trim();
    if (!titolo) throw new Error("Il titolo del flusso non può essere vuoto.");
    const gruppo = String(input.gruppo ?? "").trim() || "Flussi";
    const dove = String(input.dove ?? "").trim();
    const nota = typeof input.nota === "string" ? input.nota.trim() : "";
    const id = uniqueId(`f-${slugify(titolo)}`, (candidate) => diagram.flows.some((f) => f.id === candidate));
    return addFlow({ id, g: gruppo, t: titolo, w: dove, note: nota || undefined, h: [] });
  },
};

function requireFlow(diagram: Diagram, id: string) {
  const flow = diagram.flows.find((f) => f.id === id);
  if (!flow) throw new Error(`Nessun flusso con id "${id}".`);
  return flow;
}

// Numero di passo 1-based (come lo vede l'utente) → indice 0-based, validato contro il flusso.
function stepIndex(flow: { h: unknown[]; id: string }, value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > flow.h.length) {
    throw new Error(`Il flusso "${flow.id}" ha ${flow.h.length} passi: il numero di passo deve essere tra 1 e ${flow.h.length}.`);
  }
  return n - 1;
}

// Costruisce la tupla di un passo dai parametri dei tool. Il collegamento è quello indicato oppure l'unico
// tra le due entità; la direzione si deduce dal verso reale del collegamento.
function buildStep(diagram: Diagram, input: Record<string, unknown>): FlowStepRaw {
  const da = String(input.da ?? "");
  const a = String(input.a ?? "");
  requireEntity(diagram, da);
  requireEntity(diagram, a);
  let edge: Edge | undefined;
  if (typeof input.collegamentoId === "string" && input.collegamentoId) {
    edge = requireEdge(diagram, input.collegamentoId);
    const touches = (edge.a === da && edge.b === a) || (edge.a === a && edge.b === da);
    if (!touches) throw new Error(`Il collegamento "${edge.id}" non unisce "${da}" e "${a}".`);
  } else {
    edge = findEdgesBetween(diagram, da, a)[0];
  }
  const direzione: 1 | -1 = edge ? directionFor(edge, da) : input.direzione === -1 ? -1 : 1;
  const step: FlowStepRaw = [da, a, edge?.id ?? null, direzione, String(input.etichetta ?? "").trim()];
  if (Array.isArray(input.moduli) && input.moduli.length > 0) {
    const moduli = input.moduli.map(String);
    for (const ref of moduli) {
      const owner = [da, a].map((id) => requireEntity(diagram, id)).find((e) => e.mods?.some((m) => m.id === ref));
      if (!owner) throw new Error(`Nessun dettaglio con id "${ref}" nelle entità "${da}" e "${a}".`);
    }
    step.push(moduli);
  }
  return step;
}

const STEP_PROPERTIES = {
  da: { type: "string", description: "Id entità di partenza del passo" },
  a: { type: "string", description: "Id entità di arrivo del passo" },
  etichetta: { type: "string", description: "Descrizione del passo" },
  collegamentoId: { type: "string", description: "Id del collegamento tra le due entità; se omesso si usa quello esistente tra loro (se c'è)" },
  direzione: { type: "integer", enum: [1, -1], description: "Usata solo se non c'è un collegamento; altrimenti la direzione si deduce dal verso del collegamento" },
  moduli: { type: "array", items: { type: "string" }, description: "Id dei dettagli (mods) delle due entità coinvolti nel passo, es. \"bc.op\"" },
};

const toolAddFlowStep: ChatTool = {
  name: "addFlowStep",
  description:
    "Aggiunge un passo a un flusso esistente (in coda, o nella posizione indicata). Entità di partenza e di arrivo devono esistere; se c'è un collegamento tra le due entità viene associato automaticamente e la direzione si deduce dal suo verso.",
  input_schema: {
    type: "object",
    properties: {
      flowId: { type: "string", description: "Id del flusso (restituito da addFlow)" },
      ...STEP_PROPERTIES,
      posizione: { type: "integer", description: "Numero (da 1) che il nuovo passo avrà nel flusso; se omesso va in coda" },
    },
    required: ["flowId", "da", "a", "etichetta"],
  },
  execute(input, diagram) {
    const flow = requireFlow(diagram, String(input.flowId ?? ""));
    const step = buildStep(diagram, input);
    if (input.posizione === undefined) return addFlowStep(flow.id, step);
    const pos = Number(input.posizione);
    if (!Number.isInteger(pos) || pos < 1 || pos > flow.h.length + 1) {
      throw new Error(`La posizione deve essere tra 1 e ${flow.h.length + 1}.`);
    }
    return insertFlowStep(flow.id, pos - 1, step);
  },
};

const toolUpdateFlow: ChatTool = {
  name: "updateFlow",
  description: "Modifica titolo, gruppo, luogo o nota di un flusso esistente.",
  input_schema: {
    type: "object",
    properties: {
      flowId: { type: "string" },
      titolo: { type: "string" },
      gruppo: { type: "string" },
      dove: { type: "string" },
      nota: { type: "string", description: "Stringa vuota per rimuovere la nota" },
    },
    required: ["flowId"],
  },
  execute(input, diagram) {
    const flow = requireFlow(diagram, String(input.flowId ?? ""));
    const patch: { t?: string; g?: string; w?: string; note?: string | undefined } = {};
    if (typeof input.titolo === "string") {
      if (!input.titolo.trim()) throw new Error("Il titolo del flusso non può essere vuoto.");
      patch.t = input.titolo.trim();
    }
    if (typeof input.gruppo === "string" && input.gruppo.trim()) patch.g = input.gruppo.trim();
    if (typeof input.dove === "string") patch.w = input.dove.trim();
    if (typeof input.nota === "string") patch.note = input.nota.trim() || undefined;
    return updateFlow(flow.id, patch);
  },
};

const toolUpdateFlowStep: ChatTool = {
  name: "updateFlowStep",
  description: "Sostituisce un passo di un flusso (indicato dal numero, da 1). Passa tutti i campi del passo, non solo quelli che cambiano.",
  input_schema: {
    type: "object",
    properties: { flowId: { type: "string" }, passo: { type: "integer", description: "Numero del passo, da 1" }, ...STEP_PROPERTIES },
    required: ["flowId", "passo", "da", "a", "etichetta"],
  },
  execute(input, diagram) {
    const flow = requireFlow(diagram, String(input.flowId ?? ""));
    return updateFlowStep(flow.id, stepIndex(flow, input.passo), buildStep(diagram, input));
  },
};

const toolDeleteFlowStep: ChatTool = {
  name: "deleteFlowStep",
  description: "Elimina un passo da un flusso (indicato dal numero, da 1).",
  input_schema: {
    type: "object",
    properties: { flowId: { type: "string" }, passo: { type: "integer", description: "Numero del passo, da 1" } },
    required: ["flowId", "passo"],
  },
  execute(input, diagram) {
    const flow = requireFlow(diagram, String(input.flowId ?? ""));
    return deleteFlowStep(flow.id, stepIndex(flow, input.passo));
  },
};

const toolMoveFlowStep: ChatTool = {
  name: "moveFlowStep",
  description: "Sposta un passo di un flusso in un'altra posizione (numeri da 1).",
  input_schema: {
    type: "object",
    properties: {
      flowId: { type: "string" },
      passo: { type: "integer", description: "Numero attuale del passo, da 1" },
      nuovaPosizione: { type: "integer", description: "Numero che il passo dovrà avere, da 1" },
    },
    required: ["flowId", "passo", "nuovaPosizione"],
  },
  execute(input, diagram) {
    const flow = requireFlow(diagram, String(input.flowId ?? ""));
    return moveFlowStep(flow.id, stepIndex(flow, input.passo), stepIndex(flow, input.nuovaPosizione));
  },
};

const toolAddTechnology: ChatTool = {
  name: "addTechnology",
  description: "Aggiunge una nuova tecnologia e la collega a una o più entità esistenti.",
  input_schema: {
    type: "object",
    properties: {
      nome: { type: "string" },
      gruppo: { type: "string" },
      descrizione: { type: "string" },
      icona: { type: "string", description: ICON_PARAM_DESCRIPTION },
      entityIds: { type: "array", items: { type: "string" } },
    },
    required: ["nome", "gruppo", "descrizione", "entityIds"],
  },
  execute(input, diagram) {
    const nome = String(input.nome ?? "").trim();
    if (!nome) throw new Error("Il nome della tecnologia non può essere vuoto.");
    const entityIds = Array.isArray(input.entityIds) ? input.entityIds.map(String) : [];
    entityIds.forEach((id) => requireEntity(diagram, id));
    const icon = validateIcon(typeof input.icona === "string" ? input.icona : undefined);
    const id = uniqueId(slugify(nome), (candidate) => diagram.technologies.some((t) => t.id === candidate));
    return addTechnology({
      id,
      g: String(input.gruppo ?? "").trim() || "Tecnologie",
      n: nome,
      icon,
      mono: icon ? undefined : monogram(nome),
      e: entityIds,
      d: String(input.descrizione ?? "").trim(),
    });
  },
};

const toolUpdateTechnology: ChatTool = {
  name: "updateTechnology",
  description: "Modifica nome, gruppo, descrizione o icona di una tecnologia esistente.",
  input_schema: {
    type: "object",
    properties: {
      technologyId: { type: "string" },
      nome: { type: "string" },
      gruppo: { type: "string" },
      descrizione: { type: "string" },
      icona: { type: "string", description: `${ICON_PARAM_DESCRIPTION}; passa una stringa vuota per rimuoverla e tornare al monogramma` },
    },
    required: ["technologyId"],
  },
  execute(input, diagram) {
    const technologyId = String(input.technologyId ?? "");
    const tech = diagram.technologies.find((t) => t.id === technologyId);
    if (!tech) throw new Error(`Nessuna tecnologia con id "${technologyId}".`);
    const patch: Partial<Technology> = {};
    if (typeof input.nome === "string" && input.nome.trim()) patch.n = input.nome.trim();
    if (typeof input.gruppo === "string" && input.gruppo.trim()) patch.g = input.gruppo.trim();
    if (typeof input.descrizione === "string") patch.d = input.descrizione.trim();
    if (typeof input.icona === "string") {
      if (input.icona === "") {
        patch.icon = undefined;
        patch.mono = tech.mono ?? monogram(tech.n);
      } else {
        patch.icon = validateIcon(input.icona);
        patch.mono = undefined;
      }
    }
    return updateTechnology(technologyId, patch);
  },
};

const toolUpdateEntity: ChatTool = {
  name: "updateEntity",
  description: "Modifica nome, sottotitolo, descrizione o icona di un'entità esistente.",
  input_schema: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      nome: { type: "string" },
      sottotitolo: { type: "string" },
      descrizione: { type: "string" },
      icona: { type: "string", description: `${ICON_PARAM_DESCRIPTION}; passa una stringa vuota per rimuoverla e tornare al monogramma` },
    },
    required: ["entityId"],
  },
  execute(input, diagram) {
    const entityId = String(input.entityId ?? "");
    const entity = requireEntity(diagram, entityId);
    const patch: { n?: string; s?: string[]; desc?: string; icon?: string; mono?: string } = {};
    if (typeof input.nome === "string" && input.nome.trim()) patch.n = input.nome.trim();
    if (typeof input.sottotitolo === "string") patch.s = input.sottotitolo.trim() ? [input.sottotitolo.trim()] : undefined;
    if (typeof input.descrizione === "string") patch.desc = input.descrizione.trim() || undefined;
    if (typeof input.icona === "string") {
      if (input.icona === "") {
        patch.icon = undefined;
        patch.mono = entity.mono ?? monogram(entity.n);
      } else {
        patch.icon = validateIcon(input.icona);
        patch.mono = undefined;
      }
    }
    return updateEntity(entityId, patch);
  },
};

const toolAddEntityModule: ChatTool = {
  name: "addEntityModule",
  description: "Aggiunge un dettaglio (modulo interno, livello Component) a un'entità: una riga con titolo e sottotitolo disegnata dentro il suo rettangolo.",
  input_schema: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      titolo: { type: "string" },
      sottotitolo: { type: "string" },
    },
    required: ["entityId", "titolo"],
  },
  execute(input, diagram) {
    const entityId = String(input.entityId ?? "");
    requireEntity(diagram, entityId);
    const titolo = String(input.titolo ?? "").trim();
    if (!titolo) throw new Error("Il titolo del dettaglio non può essere vuoto.");
    const sottotitolo = typeof input.sottotitolo === "string" ? input.sottotitolo.trim() : "";
    const entity = requireEntity(diagram, entityId);
    const moduleId = uniqueId(`${entityId}.${slugify(titolo)}`, (candidate) => entity.mods?.some((m) => m.id === candidate) ?? false);
    return addEntityModule(entityId, { id: moduleId, t: titolo, s: sottotitolo });
  },
};

const toolUpdateEntityModule: ChatTool = {
  name: "updateEntityModule",
  description: "Modifica titolo o sottotitolo di un dettaglio esistente di un'entità.",
  input_schema: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      moduleId: { type: "string" },
      titolo: { type: "string" },
      sottotitolo: { type: "string" },
    },
    required: ["entityId", "moduleId"],
  },
  execute(input, diagram) {
    const entityId = String(input.entityId ?? "");
    const moduleId = String(input.moduleId ?? "");
    requireModule(diagram, entityId, moduleId);
    const patch: { t?: string; s?: string } = {};
    if (typeof input.titolo === "string" && input.titolo.trim()) patch.t = input.titolo.trim();
    if (typeof input.sottotitolo === "string") patch.s = input.sottotitolo.trim();
    return updateEntityModule(entityId, moduleId, patch);
  },
};

const toolDeleteEntityModule: ChatTool = {
  name: "deleteEntityModule",
  description: "Elimina un dettaglio esistente di un'entità.",
  input_schema: {
    type: "object",
    properties: {
      entityId: { type: "string" },
      moduleId: { type: "string" },
    },
    required: ["entityId", "moduleId"],
  },
  execute(input, diagram) {
    const entityId = String(input.entityId ?? "");
    const moduleId = String(input.moduleId ?? "");
    requireModule(diagram, entityId, moduleId);
    return deleteEntityModule(entityId, moduleId);
  },
};

const DELETABLE_KINDS: DeletableKind[] = ["entity", "edge", "flow", "technology"];

const toolDeleteElement: ChatTool = {
  name: "deleteElement",
  description: "Elimina un'entità, un collegamento, un flusso o una tecnologia dal diagramma.",
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: DELETABLE_KINDS },
      id: { type: "string" },
    },
    required: ["kind", "id"],
  },
  execute(input, diagram) {
    const kind = String(input.kind ?? "") as DeletableKind;
    if (!DELETABLE_KINDS.includes(kind)) throw new Error(`Tipo di elemento sconosciuto: "${input.kind}".`);
    const id = String(input.id ?? "");
    const exists =
      kind === "entity"
        ? diagram.entities.some((e) => e.id === id)
        : kind === "edge"
          ? diagram.edges.some((e) => e.id === id)
          : kind === "flow"
            ? diagram.flows.some((f) => f.id === id)
            : diagram.technologies.some((t) => t.id === id);
    if (!exists) throw new Error(`Nessun elemento di tipo "${kind}" con id "${id}".`);
    return deleteElement(kind, id);
  },
};

export const CHAT_TOOLS: ChatTool[] = [
  toolAddEntity,
  toolMoveEntity,
  toolAddBand,
  toolUpdateBand,
  toolDeleteBand,
  toolAddEdge,
  toolUpdateEdge,
  toolAddFlow,
  toolAddFlowStep,
  toolUpdateFlow,
  toolUpdateFlowStep,
  toolDeleteFlowStep,
  toolMoveFlowStep,
  toolAddTechnology,
  toolUpdateTechnology,
  toolUpdateEntity,
  toolAddEntityModule,
  toolUpdateEntityModule,
  toolDeleteEntityModule,
  toolDeleteElement,
];

export function toAnthropicTools(tools: ChatTool[] = CHAT_TOOLS): AnthropicTool[] {
  return tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}

export function findChatTool(name: string): ChatTool | undefined {
  return CHAT_TOOLS.find((t) => t.name === name);
}
