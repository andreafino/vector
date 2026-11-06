import type { Band, Diagram, Edge, Entity, EntityModule, Flow, FlowStepRaw, Technology } from "../types/diagram";
import type { Command } from "./types";
import { cleanFlowSteps } from "../diagram/flowSteps";
import { type BandResizeEdges, entityHeightForModuleCount, growBandToInclude, orthogonalEdgePath, orthogonalPathBetween, resizeBand, sameBandLabel, sideOfBorderPoint, sideOfPoint, sidePoint } from "../diagram/geometry";

export type DeletableKind = "entity" | "edge" | "flow" | "technology";

// Il contenitore si allarga solo quanto basta per includere la nuova entità: non si restringe mai qui.
// technologyIds collega l'entità a tecnologie già esistenti nel diagramma; newTechnologies ne crea di nuove
// (già con questa entità tra le e[] coinvolte) in un unico comando, cioè un solo passo nello storico.
export function addEntity(entity: Entity, technologyIds: string[] = [], newTechnologies: Technology[] = []): Command {
  return {
    label: `Aggiunta entità "${entity.n}"`,
    apply: (d) => {
      const entities = [...d.entities, entity];
      const bands = d.bands.map((b) => (sameBandLabel(b.l, entity.band) ? growBandToInclude(b, entity) : b));
      const linked = technologyIds.length === 0 ? d.technologies : d.technologies.map((t) => (technologyIds.includes(t.id) ? { ...t, e: [...t.e, entity.id] } : t));
      const technologies = newTechnologies.length === 0 ? linked : [...linked, ...newTechnologies.map((t) => ({ ...t, e: [...t.e, entity.id] }))];
      return { ...d, entities, bands, technologies };
    },
  };
}

// Sposta un'entità (ed eventualmente il suo contenitore, se diverso) e tiene i collegamenti attaccati;
// i collegamenti toccati diventano un segmento dritto bordo-bordo, perdendo l'eventuale instradamento a gomito.
// Non tocca mai le dimensioni dei contenitori: il ridimensionamento è manuale o legato solo all'aggiunta.
export function moveEntity(id: string, x: number, y: number, band?: string): Command {
  return {
    label: `Spostata entità "${id}"`,
    apply: (d) => {
      const entities = d.entities.map((e) => (e.id === id ? { ...e, x, y, band: band ?? e.band } : e));
      const moved = entities.find((e) => e.id === id)!;
      const edges = d.edges.map((e) => {
        if (e.a !== id && e.b !== id) return e;
        const otherId = e.a === id ? e.b : e.a;
        const other = entities.find((x) => x.id === otherId);
        if (!other) return e;
        const a = e.a === id ? moved : other;
        const b = e.b === id ? moved : other;
        return { ...e, d: orthogonalEdgePath(a, b) };
      });
      return { ...d, entities, edges };
    },
  };
}

export function addBand(band: Band): Command {
  return {
    label: `Aggiunto contenitore "${band.l}"`,
    apply: (d) => ({ ...d, bands: [...d.bands, band] }),
  };
}

// Ridimensionamento manuale trascinando un bordo/angolo del contenitore.
export function resizeBandManually(label: string, edges: BandResizeEdges, dx: number, dy: number): Command {
  return {
    label: `Ridimensionato contenitore "${label}"`,
    apply: (d) => ({ ...d, bands: d.bands.map((b) => (sameBandLabel(b.l, label) ? resizeBand(b, edges, dx, dy) : b)) }),
  };
}

// Sposta un intero contenitore insieme alle entità che gli appartengono, mantenendo attaccati
// i collegamenti (che vengono ricalcolati come i segmenti dritti bordo-bordo, come per moveEntity).
// Rinomina e/o riposiziona/ridimensiona esplicitamente un contenitore. Se cambia l'etichetta,
// tutte le entità che vi appartengono vengono riassegnate alla nuova etichetta nello stesso comando.
export function updateBand(label: string, patch: Partial<Pick<Band, "l" | "x" | "y" | "w" | "h">>): Command {
  return {
    label: `Modifica contenitore "${label}"`,
    apply: (d) => {
      const newLabel = patch.l?.trim();
      const relabel = !!newLabel && !sameBandLabel(newLabel, label);
      const bands = d.bands.map((b) => (sameBandLabel(b.l, label) ? { ...b, ...patch, l: newLabel || b.l } : b));
      const entities = relabel ? d.entities.map((e) => (sameBandLabel(e.band, label) ? { ...e, band: newLabel! } : e)) : d.entities;
      return { ...d, bands, entities };
    },
  };
}

// Elimina un contenitore insieme a tutte le entità al suo interno, i loro collegamenti e i
// riferimenti nelle tecnologie collegate (stessa cascata di deleteElement("entity", ...), ripetuta
// per ogni entità del contenitore).
export function deleteBand(label: string): Command {
  return {
    label: `Eliminato contenitore "${label}"`,
    apply: (d) => {
      const removedIds = new Set(d.entities.filter((e) => sameBandLabel(e.band, label)).map((e) => e.id));
      const bands = d.bands.filter((b) => !sameBandLabel(b.l, label));
      const entities = d.entities.filter((e) => !removedIds.has(e.id));
      const edges = d.edges.filter((e) => !removedIds.has(e.a) && !removedIds.has(e.b));
      const technologies = d.technologies.map((t) => ({ ...t, e: t.e.filter((id) => !removedIds.has(id)) }));
      const removedEdges = new Set(d.edges.filter((e) => removedIds.has(e.a) || removedIds.has(e.b)).map((e) => e.id));
      const flows = cleanFlowSteps(d.flows, { entityIds: removedIds, edgeIds: removedEdges });
      return { ...d, bands, entities, edges, technologies, flows };
    },
  };
}

export function moveBand(label: string, dx: number, dy: number): Command {
  return {
    label: `Spostato contenitore "${label}"`,
    apply: (d) => {
      const movedIds = new Set(d.entities.filter((e) => sameBandLabel(e.band, label)).map((e) => e.id));
      const bands = d.bands.map((b) => (sameBandLabel(b.l, label) ? { ...b, x: Math.round(b.x + dx), y: Math.round(b.y + dy) } : b));
      const entities = d.entities.map((e) => (movedIds.has(e.id) ? { ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) } : e));
      const edges = d.edges.map((e) => {
        if (!movedIds.has(e.a) && !movedIds.has(e.b)) return e;
        const a = entities.find((x) => x.id === e.a);
        const b = entities.find((x) => x.id === e.b);
        if (!a || !b) return e;
        return { ...e, d: orthogonalEdgePath(a, b) };
      });
      return { ...d, bands, entities, edges };
    },
  };
}

// technologyIds, se passato, sostituisce l'insieme delle tecnologie collegate a questa entità
// (aggiunge l'id entità a chi è selezionato, lo toglie a chi non lo è più); omesso, le tecnologie non cambiano.
// newTechnologies crea nuove tecnologie già collegate a questa entità, in un unico comando.
export function updateEntity(id: string, patch: Partial<Entity>, technologyIds?: string[], newTechnologies: Technology[] = []): Command {
  return {
    label: `Modifica entità "${id}"`,
    apply: (d) => {
      const entities = d.entities.map((e) => (e.id === id ? { ...e, ...patch } : e));
      let technologies = d.technologies;
      if (technologyIds !== undefined) {
        technologies = technologies.map((t) => {
          const want = technologyIds.includes(t.id);
          const has = t.e.includes(id);
          if (has === want) return t;
          return { ...t, e: want ? [...t.e, id] : t.e.filter((eid) => eid !== id) };
        });
      }
      if (newTechnologies.length > 0) technologies = [...technologies, ...newTechnologies.map((t) => ({ ...t, e: [...t.e, id] }))];
      return { ...d, entities, technologies };
    },
  };
}

// Aggiunge un "dettaglio" (modulo interno, livello Component) all'entità: una riga con titolo e
// sottotitolo disegnata dentro il suo rettangolo. L'altezza dell'entità si adatta automaticamente
// al numero di dettagli (vedi entityHeightForModuleCount), così le righe non escono mai dal bordo.
export function addEntityModule(entityId: string, module: EntityModule): Command {
  return {
    label: `Aggiunto dettaglio "${module.t}" a "${entityId}"`,
    apply: (d) => ({
      ...d,
      entities: d.entities.map((e) => {
        if (e.id !== entityId) return e;
        const mods = [...(e.mods ?? []), module];
        return { ...e, mods, h: entityHeightForModuleCount(mods.length) };
      }),
    }),
  };
}

export function updateEntityModule(entityId: string, moduleId: string, patch: Partial<Omit<EntityModule, "id">>): Command {
  return {
    label: `Modifica dettaglio "${moduleId}"`,
    apply: (d) => ({
      ...d,
      entities: d.entities.map((e) =>
        e.id === entityId ? { ...e, mods: (e.mods ?? []).map((m) => (m.id === moduleId ? { ...m, ...patch } : m)) } : e
      ),
    }),
  };
}

export function deleteEntityModule(entityId: string, moduleId: string): Command {
  return {
    label: `Eliminato dettaglio "${moduleId}"`,
    apply: (d) => ({
      ...d,
      entities: d.entities.map((e) => {
        if (e.id !== entityId) return e;
        const mods = (e.mods ?? []).filter((m) => m.id !== moduleId);
        return { ...e, mods: mods.length > 0 ? mods : undefined, h: entityHeightForModuleCount(mods.length) };
      }),
      flows: cleanFlowSteps(d.flows, { moduleRefs: new Set([moduleId]) }),
    }),
  };
}

export function addEdge(edge: Edge): Command {
  return {
    label: `Aggiunto collegamento "${edge.a} → ${edge.b}"`,
    apply: (d) => ({ ...d, edges: [...d.edges, edge] }),
  };
}

export function updateEdge(id: string, patch: Partial<Edge>): Command {
  return {
    label: `Modifica collegamento "${id}"`,
    apply: (d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
  };
}

// Riaggancia un estremo del collegamento ("a" o "b") a un'altra entità (o a un altro lato della stessa),
// scegliendo il lato in base al punto esatto in cui è stata rilasciata la punta trascinata: non si
// limita a ricollegare l'entità, lascia anche scegliere a quale lato attaccarsi. L'altro estremo resta
// dov'era, il percorso tra i due viene ricalcolato rispettando entrambe le uscite.
export function reanchorEdge(id: string, end: "a" | "b", entityId: string, dropX: number, dropY: number): Command {
  return {
    label: `Nuovo ancoraggio del collegamento "${id}"`,
    apply: (d) => ({
      ...d,
      edges: d.edges.map((e) => {
        if (e.id !== id) return e;
        const target = d.entities.find((x) => x.id === entityId);
        const otherId = end === "a" ? e.b : e.a;
        const other = d.entities.find((x) => x.id === otherId);
        if (!target || !other) return { ...e, [end]: entityId };
        const side = sideOfPoint(target, dropX, dropY);
        const newPoint = sidePoint(target, side, side === "l" || side === "r" ? dropY : dropX);
        const otherPoint = end === "a" ? e.d[e.d.length - 1] : e.d[0];
        const otherSide = sideOfBorderPoint(other, otherPoint);
        const path =
          end === "a" ? orthogonalPathBetween(newPoint, side, otherPoint, otherSide) : orthogonalPathBetween(otherPoint, otherSide, newPoint, side);
        return { ...e, [end]: entityId, d: path };
      }),
    }),
  };
}

export function addFlow(flow: Flow): Command {
  return {
    label: `Aggiunto flusso "${flow.t}"`,
    apply: (d) => ({ ...d, flows: [...d.flows, flow] }),
    output: { id: flow.id },
  };
}

export function addFlowStep(flowId: string, step: FlowStepRaw): Command {
  return {
    label: `Aggiunto passo al flusso "${flowId}"`,
    apply: (d) => ({ ...d, flows: d.flows.map((f) => (f.id === flowId ? { ...f, h: [...f.h, step] } : f)) }),
  };
}

export function updateFlow(id: string, patch: Partial<Pick<Flow, "t" | "g" | "w" | "note">>): Command {
  return {
    label: `Modifica flusso "${id}"`,
    apply: (d) => ({ ...d, flows: d.flows.map((f) => (f.id === id ? { ...f, ...patch } : f)) }),
  };
}

export function insertFlowStep(flowId: string, index: number, step: FlowStepRaw): Command {
  return {
    label: `Aggiunto passo al flusso "${flowId}"`,
    apply: (d) => ({
      ...d,
      flows: d.flows.map((f) => {
        if (f.id !== flowId) return f;
        const at = Math.max(0, Math.min(index, f.h.length));
        return { ...f, h: [...f.h.slice(0, at), step, ...f.h.slice(at)] };
      }),
    }),
  };
}

export function updateFlowStep(flowId: string, index: number, step: FlowStepRaw): Command {
  return {
    label: `Modifica passo ${index + 1} del flusso "${flowId}"`,
    apply: (d) => ({
      ...d,
      flows: d.flows.map((f) => (f.id === flowId ? { ...f, h: f.h.map((s, i) => (i === index ? step : s)) } : f)),
    }),
  };
}

export function deleteFlowStep(flowId: string, index: number): Command {
  return {
    label: `Eliminato passo ${index + 1} del flusso "${flowId}"`,
    apply: (d) => ({
      ...d,
      flows: d.flows.map((f) => (f.id === flowId ? { ...f, h: f.h.filter((_, i) => i !== index) } : f)),
    }),
  };
}

export function moveFlowStep(flowId: string, from: number, to: number): Command {
  return {
    label: `Spostato passo ${from + 1} del flusso "${flowId}"`,
    apply: (d) => ({
      ...d,
      flows: d.flows.map((f) => {
        if (f.id !== flowId || from < 0 || from >= f.h.length || to < 0 || to >= f.h.length) return f;
        const h = [...f.h];
        const [moved] = h.splice(from, 1);
        h.splice(to, 0, moved);
        return { ...f, h };
      }),
    }),
  };
}

export function addTechnology(technology: Technology): Command {
  return {
    label: `Aggiunta tecnologia "${technology.n}"`,
    apply: (d) => ({ ...d, technologies: [...d.technologies, technology] }),
  };
}

export function updateTechnology(id: string, patch: Partial<Technology>): Command {
  return {
    label: `Modifica tecnologia "${id}"`,
    apply: (d) => ({ ...d, technologies: d.technologies.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
  };
}

export function deleteElement(kind: DeletableKind, id: string): Command {
  switch (kind) {
    case "entity":
      return {
        label: `Eliminata entità "${id}"`,
        apply: (d: Diagram) => {
          const entities = d.entities.filter((e) => e.id !== id);
          const edges = d.edges.filter((e) => e.a !== id && e.b !== id);
          const technologies = d.technologies.map((t) => ({ ...t, e: t.e.filter((eid) => eid !== id) }));
          const removedEdges = new Set(d.edges.filter((e) => e.a === id || e.b === id).map((e) => e.id));
          const flows = cleanFlowSteps(d.flows, { entityIds: new Set([id]), edgeIds: removedEdges });
          return { ...d, entities, edges, technologies, flows };
        },
      };
    case "edge":
      return {
        label: `Eliminato collegamento "${id}"`,
        apply: (d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id), flows: cleanFlowSteps(d.flows, { edgeIds: new Set([id]) }) }),
      };
    case "flow":
      return {
        label: `Eliminato flusso "${id}"`,
        apply: (d) => ({ ...d, flows: d.flows.filter((f) => f.id !== id) }),
      };
    case "technology":
      return {
        label: `Eliminata tecnologia "${id}"`,
        apply: (d) => ({ ...d, technologies: d.technologies.filter((t) => t.id !== id) }),
      };
  }
}
