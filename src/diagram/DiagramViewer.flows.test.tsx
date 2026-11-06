import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Diagram } from "../types/diagram";
import { useDiagramStore } from "../store/useDiagramStore";
import { DiagramViewer } from "./DiagramViewer";

function fixture(): Diagram {
  return {
    bands: [{ l: "Banda A", x: 0, y: 0, w: 2000, h: 2000 }],
    entities: [
      { id: "a", n: "Entità A", band: "Banda A", x: 0, y: 0, mono: "A" },
      { id: "b", n: "Entità B", band: "Banda A", x: 300, y: 0, mono: "B" },
    ],
    edges: [{ id: "e-a-b", a: "a", b: "b", d: [[120, 36], [300, 36]] }],
    flows: [],
    technologies: [],
    authKinds: { mi: "", tok: "", sec: "", per: "" },
    auth: [],
  };
}

function resetStore(d: Diagram) {
  useDiagramStore.setState({
    diagram: d,
    versions: [{ numero: 0, diagramma: d, descrizione: "Versione iniziale", origine: "manuale", autore: "Sistema", data: new Date().toISOString() }],
    index: 0,
  });
}

function TestApp() {
  const diagram = useDiagramStore((s) => s.diagram);
  return <DiagramViewer diagram={diagram} title="Test" subtitle="Test" inTeams={false} />;
}

afterEach(() => cleanup());

describe("editing manuale dei flussi", () => {
  it("crea un flusso, aggiunge un passo con collegamento e direzione dedotti, poi lo elimina", async () => {
    resetStore(fixture());
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "+ Nuovo flusso" }));
    await user.type(screen.getByLabelText("Titolo *"), "Ordine");
    await user.click(screen.getByRole("button", { name: "Crea" }));

    const flows = useDiagramStore.getState().diagram.flows;
    expect(flows).toHaveLength(1);
    expect(flows[0]).toMatchObject({ t: "Ordine", g: "Flussi", h: [] });

    await user.click(screen.getByRole("button", { name: "+ Aggiungi passo" }));
    await user.type(screen.getByLabelText("Descrizione del passo"), "Invio ordine");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(useDiagramStore.getState().diagram.flows[0].h).toEqual([["a", "b", "e-a-b", 1, "Invio ordine"]]);

    await user.click(screen.getByRole("button", { name: "Elimina il passo 1" }));
    expect(useDiagramStore.getState().diagram.flows[0].h).toEqual([]);

    useDiagramStore.getState().undo();
    expect(useDiagramStore.getState().diagram.flows[0].h).toHaveLength(1);
  });

  it("modifica il titolo del flusso", async () => {
    const d = fixture();
    d.flows = [{ id: "f1", g: "G", t: "Vecchio", w: "", h: [["a", "b", "e-a-b", 1, "x"]] }];
    resetStore(d);
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Modifica" }));
    const titolo = screen.getByLabelText("Titolo");
    await user.clear(titolo);
    await user.type(titolo, "Nuovo");
    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(useDiagramStore.getState().diagram.flows[0].t).toBe("Nuovo");
  });

  it("il passo può indicare il dettaglio di un'entità (facoltativo) e lo salva in h[5]", async () => {
    const d = fixture();
    d.entities[0].mods = [{ id: "a.op", t: "Operazione", s: "" }];
    d.flows = [{ id: "f1", g: "G", t: "Flusso", w: "", h: [] }];
    resetStore(d);
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "+ Aggiungi passo" }));
    await user.type(screen.getByLabelText("Descrizione del passo"), "Con dettaglio");
    await user.selectOptions(screen.getByLabelText("Dettaglio di Entità A (facoltativo)"), "a.op");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(useDiagramStore.getState().diagram.flows[0].h).toEqual([["a", "b", "e-a-b", 1, "Con dettaglio", ["a.op"]]]);

    await user.click(screen.getByRole("button", { name: "+ Aggiungi passo" }));
    await user.type(screen.getByLabelText("Descrizione del passo"), "Senza");
    await user.click(screen.getByRole("button", { name: "Salva" }));
    expect(useDiagramStore.getState().diagram.flows[0].h[1]).toEqual(["a", "b", "e-a-b", 1, "Senza"]);
  });
});
