import type { Diagram, Edge, Flow, FlowStepRaw } from "../types/diagram";

// Collegamenti che uniscono due entità, in qualunque verso.
export function findEdgesBetween(diagram: Diagram, aId: string, bId: string): Edge[] {
  return diagram.edges.filter((e) => (e.a === aId && e.b === bId) || (e.a === bId && e.b === aId));
}

// 1 se il passo da "da" segue il verso a→b del collegamento, -1 se lo percorre al contrario.
export function directionFor(edge: Edge, da: string): 1 | -1 {
  return edge.a === da ? 1 : -1;
}

// Pulizia dei passi dopo l'eliminazione di entità, collegamenti o dettagli: un passo che perde
// una delle sue entità non ha più senso e viene rimosso; se perde solo il collegamento o un
// dettaglio, il passo resta e perde solo quel riferimento.
export function cleanFlowSteps(
  flows: Flow[],
  removed: { entityIds?: Set<string>; edgeIds?: Set<string>; moduleRefs?: Set<string> }
): Flow[] {
  const { entityIds, edgeIds, moduleRefs } = removed;
  return flows.map((f) => {
    let changed = false;
    const h: FlowStepRaw[] = [];
    for (const step of f.h) {
      const [da, a, edgeId, dir, label, mods] = step;
      if (entityIds && (entityIds.has(da) || entityIds.has(a))) {
        changed = true;
        continue;
      }
      const dropEdge = !!edgeIds && edgeId !== null && edgeIds.has(edgeId);
      const keptMods = moduleRefs && mods ? mods.filter((m) => !moduleRefs.has(m)) : mods;
      const dropMods = !!mods && keptMods!.length !== mods.length;
      if (!dropEdge && !dropMods) {
        h.push(step);
        continue;
      }
      changed = true;
      const next: FlowStepRaw = [da, a, dropEdge ? null : edgeId, dir, label];
      if (keptMods && keptMods.length > 0) next.push(keptMods);
      h.push(next);
    }
    return changed ? { ...f, h } : f;
  });
}
