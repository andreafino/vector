import { useCallback, useEffect, useMemo, useState } from "react";
import type { Diagram } from "../types/diagram";
import { parseFlowSteps } from "../data/loadDiagram";
import type { Highlight, Selection, Tab } from "./types";

const STEP_MS = 2200;

export function useDiagramState(diagram: Diagram) {
  const [tab, setTab] = useState<Tab>("flows");
  const [sel, setSel] = useState<Selection | null>({ kind: "flow", id: diagram.flows[0]?.id });
  const [rawHop, setHop] = useState(0);
  const [playing, setPlaying] = useState(false);

  const curFlow = useMemo(() => {
    if (sel?.kind !== "flow") return null;
    return diagram.flows.find((f) => f.id === sel.id) ?? null;
  }, [diagram.flows, sel]);

  const curFlowSteps = useMemo(() => (curFlow ? parseFlowSteps(curFlow) : []), [curFlow]);

  // Dopo aver eliminato o spostato passi, il passo corrente può uscire dal flusso: lo riporto in range.
  const hop = Math.max(0, Math.min(rawHop, curFlowSteps.length - 1));

  const select = useCallback((kind: Selection["kind"], id: string, forTab?: Tab) => {
    setSel((prev) => {
      if (prev && prev.kind === kind && prev.id === id) return null;
      return { kind, id };
    });
    setHop(0);
    setPlaying(false);
    if (forTab) setTab(forTab);
  }, []);

  const clearSel = useCallback(() => {
    setSel(null);
    setPlaying(false);
  }, []);

  const advance = useCallback(
    (auto: boolean) => {
      if (!curFlow) return;
      const steps = curFlowSteps;
      setHop((h) => {
        if (h < steps.length - 1) return h + 1;
        return h;
      });
      if (auto && curFlowSteps.length > 0 && hop >= curFlowSteps.length - 1) {
        const i = diagram.flows.findIndex((f) => f.id === curFlow.id);
        const next = diagram.flows[i + 1];
        if (next) {
          setSel({ kind: "flow", id: next.id });
          setHop(0);
        } else {
          setPlaying(false);
        }
      }
    },
    [curFlow, curFlowSteps, diagram.flows, hop]
  );

  const togglePlay = useCallback(() => {
    if (!curFlow) return;
    setPlaying((p) => {
      if (!p && hop >= curFlowSteps.length - 1) {
        setHop(0);
        return true;
      }
      return !p;
    });
  }, [curFlow, curFlowSteps.length, hop]);

  const nextHop = useCallback(() => {
    setPlaying(false);
    advance(false);
  }, [advance]);

  const prevHop = useCallback(() => {
    setPlaying(false);
    setHop((h) => Math.max(0, h - 1));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => advance(true), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, hop, advance]);

  const highlight = useMemo<Highlight | null>(() => {
    if (!sel) return null;
    const nodes = new Set<string>();
    const mods = new Set<string>();
    const edges = new Map<string, 1 | -1 | 2>();
    let cur: Highlight["cur"] = null;
    let focus: string | null = null;

    if (sel.kind === "flow") {
      const flow = diagram.flows.find((f) => f.id === sel.id);
      if (flow) {
        const steps = parseFlowSteps(flow);
        steps.forEach((s) => {
          nodes.add(s.from);
          nodes.add(s.to);
          (s.modules ?? []).forEach((m) => mods.add(m));
          if (s.edgeId) {
            const prev = edges.get(s.edgeId);
            edges.set(s.edgeId, prev === undefined ? s.direction : prev === s.direction ? prev : 2);
          }
        });
        const step = steps[hop];
        if (step) {
          cur = { from: step.from, to: step.to, edge: step.edgeId, dir: step.direction, mods: new Set(step.modules ?? []) };
        }
      }
    } else if (sel.kind === "entity") {
      focus = sel.id;
      nodes.add(sel.id);
      diagram.edges.forEach((e) => {
        if (e.a === sel.id || e.b === sel.id) {
          nodes.add(e.a);
          nodes.add(e.b);
          edges.set(e.id, 1);
        }
      });
    } else if (sel.kind === "tech") {
      const tech = diagram.technologies.find((t) => t.id === sel.id);
      tech?.e.forEach((id) => nodes.add(id));
      diagram.edges.forEach((e) => {
        if (nodes.has(e.a) && nodes.has(e.b)) edges.set(e.id, 1);
      });
    }

    return { nodes, mods, edges, cur, focus };
  }, [diagram, hop, sel]);

  return {
    tab,
    setTab,
    sel,
    hop,
    setHop,
    playing,
    select,
    clearSel,
    togglePlay,
    nextHop,
    prevHop,
    curFlow,
    curFlowSteps,
    highlight,
  };
}
