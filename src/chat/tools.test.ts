import { describe, expect, it } from "vitest";
import type { Diagram } from "../types/diagram";
import { findChatTool } from "./tools";

function fixture(): Diagram {
  return {
    bands: [
      { l: "Banda A", x: 0, y: 0, w: 300, h: 200 },
      { l: "Banda B", x: 400, y: 0, w: 300, h: 200 },
    ],
    entities: [
      { id: "a", n: "Entità A", band: "Banda A", x: 20, y: 40, mono: "A" },
      { id: "b", n: "Entità B", band: "Banda B", x: 420, y: 40, mono: "B" },
    ],
    edges: [{ id: "e1", a: "a", b: "b", d: [[260, 76], [420, 76]] }],
    flows: [],
    technologies: [{ id: "t1", g: "Gruppo", n: "Tech", e: ["a"], d: "desc" }],
    authKinds: { mi: "", tok: "", sec: "", per: "" },
    auth: [],
  };
}

describe("chat tools", () => {
  it("addEntity crea un comando che aggiunge l'entità nella banda indicata", () => {
    const d = fixture();
    const tool = findChatTool("addEntity")!;
    const command = tool.execute({ nome: "Cache Redis", banda: "Banda A" }, d);
    const next = command.apply(d);
    expect(next.entities).toHaveLength(3);
    const created = next.entities.find((e) => e.n === "Cache Redis");
    expect(created?.band).toBe("Banda A");
  });

  it("addEntity propone un'icona dal nome se non indicata", () => {
    const d = fixture();
    const tool = findChatTool("addEntity")!;
    const next = tool.execute({ nome: "Key Vault segreti", banda: "Banda A" }, d).apply(d);
    expect(next.entities.find((e) => e.n === "Key Vault segreti")?.icon).toBe("kv");
    const none = tool.execute({ nome: "Pippo", banda: "Banda A" }, d).apply(d);
    expect(none.entities.find((e) => e.n === "Pippo")?.icon).toBeUndefined();
  });

  it("addEntity lancia un errore se la banda non esiste", () => {
    const d = fixture();
    const tool = findChatTool("addEntity")!;
    expect(() => tool.execute({ nome: "X", banda: "Non esiste" }, d)).toThrow();
  });

  it("moveEntity lancia un errore se l'entità non esiste", () => {
    const d = fixture();
    const tool = findChatTool("moveEntity")!;
    expect(() => tool.execute({ entityId: "zzz", x: 10, y: 10 }, d)).toThrow();
  });

  it("addEdge collega due entità esistenti", () => {
    const d = fixture();
    const tool = findChatTool("addEdge")!;
    const command = tool.execute({ entityIdA: "a", entityIdB: "b", etichetta: "chiama" }, d);
    const next = command.apply(d);
    expect(next.edges).toHaveLength(2);
    expect(next.edges[1].l).toBe("chiama");
  });

  it("addEdge lancia un errore se un'entità non esiste", () => {
    const d = fixture();
    const tool = findChatTool("addEdge")!;
    expect(() => tool.execute({ entityIdA: "a", entityIdB: "zzz" }, d)).toThrow();
  });

  it("updateEdge lancia un errore se il collegamento non esiste", () => {
    const d = fixture();
    const tool = findChatTool("updateEdge")!;
    expect(() => tool.execute({ edgeId: "zzz", etichetta: "x" }, d)).toThrow();
  });

  it("addFlow crea un flusso vuoto e restituisce il suo id", () => {
    const d = fixture();
    const command = findChatTool("addFlow")!.execute({ titolo: "Flusso di prova", gruppo: "Gruppo", dove: "Ovunque" }, d);
    const next = command.apply(d);
    expect(next.flows).toHaveLength(1);
    expect(next.flows[0].h).toEqual([]);
    expect(command.output).toEqual({ id: next.flows[0].id });
  });

  it("addFlowStep aggiunge un passo come tupla e trova l'edgeId esistente", () => {
    const d = fixture();
    const flowCommand = findChatTool("addFlow")!.execute({ titolo: "Flusso", gruppo: "G", dove: "W" }, d);
    const withFlow = flowCommand.apply(d);
    const flowId = withFlow.flows[0].id;
    const stepCommand = findChatTool("addFlowStep")!.execute({ flowId, da: "a", a: "b", etichetta: "passo 1" }, withFlow);
    const next = stepCommand.apply(withFlow);
    expect(next.flows[0].h).toEqual([["a", "b", "e1", 1, "passo 1"]]);
  });

  it("addFlowStep lancia un errore se un'entità del passo non esiste", () => {
    const d = fixture();
    const withFlow = findChatTool("addFlow")!.execute({ titolo: "Flusso", gruppo: "G", dove: "W" }, d).apply(d);
    expect(() =>
      findChatTool("addFlowStep")!.execute({ flowId: withFlow.flows[0].id, da: "a", a: "zzz", etichetta: "x" }, withFlow)
    ).toThrow();
  });

  it("addFlowStep lancia un errore se il flusso non esiste", () => {
    const d = fixture();
    expect(() => findChatTool("addFlowStep")!.execute({ flowId: "nope", da: "a", a: "b", etichetta: "x" }, d)).toThrow("Nessun flusso");
  });

  it("addTechnology collega le entità indicate", () => {
    const d = fixture();
    const tool = findChatTool("addTechnology")!;
    const command = tool.execute({ nome: "OAuth 2.0", gruppo: "Protocolli", descrizione: "desc", entityIds: ["a", "b"] }, d);
    const next = command.apply(d);
    expect(next.technologies).toHaveLength(2);
    expect(next.technologies[1].e).toEqual(["a", "b"]);
  });

  it("updateEntity aggiorna i campi richiesti", () => {
    const d = fixture();
    const tool = findChatTool("updateEntity")!;
    const command = tool.execute({ entityId: "a", nome: "Nuovo nome" }, d);
    const next = command.apply(d);
    expect(next.entities.find((e) => e.id === "a")?.n).toBe("Nuovo nome");
  });

  it("deleteElement lancia un errore se l'id non esiste", () => {
    const d = fixture();
    const tool = findChatTool("deleteElement")!;
    expect(() => tool.execute({ kind: "entity", id: "zzz" }, d)).toThrow();
  });

  it("deleteElement elimina l'elemento indicato", () => {
    const d = fixture();
    const tool = findChatTool("deleteElement")!;
    const command = tool.execute({ kind: "entity", id: "b" }, d);
    const next = command.apply(d);
    expect(next.entities.find((e) => e.id === "b")).toBeUndefined();
  });

  it("addEntityModule aggiunge un dettaglio all'entità indicata", () => {
    const d = fixture();
    const tool = findChatTool("addEntityModule")!;
    const command = tool.execute({ entityId: "a", titolo: "Operazione", sottotitolo: "stato" }, d);
    const next = command.apply(d);
    const entity = next.entities.find((e) => e.id === "a")!;
    expect(entity.mods).toHaveLength(1);
    expect(entity.mods![0].t).toBe("Operazione");
  });

  it("addEntityModule lancia un errore se l'entità non esiste", () => {
    const d = fixture();
    const tool = findChatTool("addEntityModule")!;
    expect(() => tool.execute({ entityId: "zzz", titolo: "X" }, d)).toThrow();
  });

  it("updateEntityModule lancia un errore se il dettaglio non esiste", () => {
    const d = fixture();
    const tool = findChatTool("updateEntityModule")!;
    expect(() => tool.execute({ entityId: "a", moduleId: "zzz", titolo: "X" }, d)).toThrow();
  });

  it("deleteEntityModule elimina il dettaglio indicato", () => {
    const d = fixture();
    const addTool = findChatTool("addEntityModule")!;
    const withModule = addTool.execute({ entityId: "a", titolo: "Operazione" }, d).apply(d);
    const deleteTool = findChatTool("deleteEntityModule")!;
    const moduleId = withModule.entities.find((e) => e.id === "a")!.mods![0].id;
    const next = deleteTool.execute({ entityId: "a", moduleId }, withModule).apply(withModule);
    expect(next.entities.find((e) => e.id === "a")!.mods).toBeUndefined();
  });
});
