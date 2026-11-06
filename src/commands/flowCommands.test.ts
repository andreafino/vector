import { describe, expect, it } from "vitest";
import type { Diagram, FlowStepRaw } from "../types/diagram";
import { deleteElement, deleteEntityModule, deleteFlowStep, insertFlowStep, moveFlowStep, updateFlow, updateFlowStep } from "./commands";
import { findChatTool } from "../chat/tools";

const S1: FlowStepRaw = ["a", "b", "e1", 1, "uno", ["a.m1"]];
const S2: FlowStepRaw = ["b", "c", "e2", -1, "due"];
const S3: FlowStepRaw = ["c", "a", null, 1, "tre"];

function fixture(): Diagram {
  return {
    bands: [{ l: "B", x: 0, y: 0, w: 500, h: 200 }],
    entities: [
      { id: "a", n: "A", band: "B", x: 0, y: 0, mono: "A", mods: [{ id: "a.m1", t: "M1", s: "" }] },
      { id: "b", n: "B", band: "B", x: 100, y: 0, mono: "B" },
      { id: "c", n: "C", band: "B", x: 200, y: 0, mono: "C" },
    ],
    edges: [
      { id: "e1", a: "a", b: "b", d: [[0, 0]] },
      { id: "e2", a: "c", b: "b", d: [[0, 0]] },
    ],
    flows: [{ id: "f1", g: "G", t: "Flusso", w: "W", h: [S1, S2, S3] }],
    technologies: [],
    authKinds: { mi: "", tok: "", sec: "", per: "" },
    auth: [],
  };
}

describe("comandi sui flussi", () => {
  it("updateFlow modifica solo i campi indicati senza mutare l'originale", () => {
    const d = fixture();
    const next = updateFlow("f1", { t: "Nuovo", note: "nota" }).apply(d);
    expect(next.flows[0]).toMatchObject({ t: "Nuovo", note: "nota", g: "G", w: "W" });
    expect(d.flows[0].t).toBe("Flusso");
  });

  it("insertFlowStep inserisce nella posizione indicata", () => {
    const next = insertFlowStep("f1", 1, ["a", "c", null, 1, "nuovo"]).apply(fixture());
    expect(next.flows[0].h.map((s) => s[4])).toEqual(["uno", "nuovo", "due", "tre"]);
  });

  it("updateFlowStep sostituisce solo il passo indicato", () => {
    const next = updateFlowStep("f1", 1, ["b", "a", "e1", -1, "cambiato"]).apply(fixture());
    expect(next.flows[0].h.map((s) => s[4])).toEqual(["uno", "cambiato", "tre"]);
  });

  it("deleteFlowStep rimuove il passo indicato", () => {
    const next = deleteFlowStep("f1", 0).apply(fixture());
    expect(next.flows[0].h.map((s) => s[4])).toEqual(["due", "tre"]);
  });

  it("moveFlowStep riordina e ignora indici fuori range", () => {
    const d = fixture();
    expect(moveFlowStep("f1", 0, 2).apply(d).flows[0].h.map((s) => s[4])).toEqual(["due", "tre", "uno"]);
    expect(moveFlowStep("f1", 0, 9).apply(d).flows[0].h).toEqual(d.flows[0].h);
  });
});

describe("pulizia dei passi", () => {
  it("eliminare un'entità rimuove i passi che la usano", () => {
    const next = deleteElement("entity", "b").apply(fixture());
    expect(next.flows[0].h.map((s) => s[4])).toEqual(["tre"]);
  });

  it("eliminare un collegamento azzera solo l'edgeId dei passi", () => {
    const next = deleteElement("edge", "e1").apply(fixture());
    expect(next.flows[0].h[0]).toEqual(["a", "b", null, 1, "uno", ["a.m1"]]);
    expect(next.flows[0].h).toHaveLength(3);
  });

  it("eliminare un dettaglio lo toglie dai passi", () => {
    const next = deleteEntityModule("a", "a.m1").apply(fixture());
    expect(next.flows[0].h[0]).toEqual(["a", "b", "e1", 1, "uno"]);
  });
});

describe("tool chat sui flussi", () => {
  it("addFlowStep deduce la direzione dal verso reale del collegamento", () => {
    const d = fixture();
    // e2 va da c a b: un passo b → c lo percorre al contrario
    const next = findChatTool("addFlowStep")!.execute({ flowId: "f1", da: "b", a: "c", etichetta: "x" }, d).apply(d);
    expect(next.flows[0].h[3]).toEqual(["b", "c", "e2", -1, "x"]);
  });

  it("addFlowStep accetta posizione e moduli, e rifiuta moduli sconosciuti", () => {
    const d = fixture();
    const tool = findChatTool("addFlowStep")!;
    const next = tool.execute({ flowId: "f1", da: "a", a: "b", etichetta: "x", posizione: 1, moduli: ["a.m1"] }, d).apply(d);
    expect(next.flows[0].h[0]).toEqual(["a", "b", "e1", 1, "x", ["a.m1"]]);
    expect(() => tool.execute({ flowId: "f1", da: "a", a: "b", etichetta: "x", moduli: ["zzz"] }, d)).toThrow();
  });

  it("deleteFlowStep e moveFlowStep usano numeri da 1 e validano il range", () => {
    const d = fixture();
    expect(findChatTool("deleteFlowStep")!.execute({ flowId: "f1", passo: 1 }, d).apply(d).flows[0].h).toHaveLength(2);
    expect(() => findChatTool("deleteFlowStep")!.execute({ flowId: "f1", passo: 4 }, d)).toThrow();
    const moved = findChatTool("moveFlowStep")!.execute({ flowId: "f1", passo: 3, nuovaPosizione: 1 }, d).apply(d);
    expect(moved.flows[0].h.map((s) => s[4])).toEqual(["tre", "uno", "due"]);
  });

  it("updateFlow rifiuta un titolo vuoto", () => {
    expect(() => findChatTool("updateFlow")!.execute({ flowId: "f1", titolo: "  " }, fixture())).toThrow();
  });
});
