import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Diagram } from "../types/diagram";
import { useDiagramStore } from "../store/useDiagramStore";
import { deleteElement, updateEdge } from "../commands/commands";
import { DiagramViewer } from "./DiagramViewer";

function fixture(withEdge = false): Diagram {
  return {
    bands: [{ l: "Banda A", x: 0, y: 0, w: 2000, h: 2000 }],
    entities: [
      { id: "a", n: "Entità A", band: "Banda A", x: 0, y: 0, mono: "A" },
      { id: "b", n: "Entità B", band: "Banda A", x: 300, y: 0, mono: "B" },
    ],
    edges: withEdge ? [{ id: "e-a-b", a: "a", b: "b", d: [[120, 36], [300, 36]] }] : [],
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

describe("editing manuale nella UI", () => {
  it("modalità 'Nuova entità': clic sul disegno crea l'entità tramite il comando addEntity", async () => {
    resetStore(fixture());
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Strumenti di modifica" }));
    await user.click(screen.getByRole("button", { name: "Nuovo" }));
    await user.click(screen.getByRole("button", { name: "Entità" }));
    fireEvent.click(screen.getByText("Banda A"));

    expect(await screen.findByText("in Banda A")).toBeInTheDocument();
    const nomeInput = screen.getByLabelText("Nome *");
    await user.type(nomeInput, "Server di test");
    await user.click(screen.getByRole("button", { name: "Crea" }));

    expect(useDiagramStore.getState().diagram.entities.some((e) => e.n === "Server di test")).toBe(true);
    expect(screen.getByText("Server di test")).toBeInTheDocument();
  });

  it("modalità 'Nuovo contenitore': clic sul disegno crea una banda tramite il comando addBand", async () => {
    resetStore(fixture());
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Strumenti di modifica" }));
    await user.click(screen.getByRole("button", { name: "Nuovo" }));
    await user.click(screen.getByRole("button", { name: "Contenitore" }));
    const svg = screen.getByRole("img", { name: "Schema architetturale" });
    fireEvent.click(svg, { clientX: 500, clientY: 500 });

    const etichettaInput = await screen.findByLabelText("Etichetta *");
    await user.type(etichettaInput, "Nuova area");
    await user.click(screen.getByRole("button", { name: "Crea" }));

    expect(useDiagramStore.getState().diagram.bands.some((b) => b.l === "Nuova area")).toBe(true);
  });

  it("modalità 'Collega': due clic su entità diverse propongono il collegamento tramite addEdge", async () => {
    resetStore(fixture());
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Strumenti di modifica" }));
    await user.click(screen.getByRole("button", { name: "Collega" }));
    fireEvent.click(screen.getByText("Entità A"));
    fireEvent.click(screen.getByText("Entità B"));

    await screen.findByText("Nuovo collegamento");
    await user.click(screen.getByRole("button", { name: "Crea collegamento" }));

    const edges = useDiagramStore.getState().diagram.edges;
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ a: "a", b: "b" });
  });

  it("modalità 'Elimina': clic su un'entità la rimuove insieme ai collegamenti connessi", async () => {
    resetStore(fixture(true));
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Strumenti di modifica" }));
    await user.click(screen.getByRole("button", { name: "Elimina" }));
    fireEvent.click(screen.getByText("Entità A"));

    const diagram = useDiagramStore.getState().diagram;
    expect(diagram.entities.some((e) => e.id === "a")).toBe(false);
    expect(diagram.edges).toHaveLength(0);
  });

  it("modalità 'Seleziona': trascinare il bordo destro di un contenitore lo ridimensiona manualmente, senza muovere le entità", () => {
    resetStore(fixture());
    const { container } = render(<TestApp />);

    const bandBefore = useDiagramStore.getState().diagram.bands.find((b) => b.l === "Banda A")!;
    const entityBefore = useDiagramStore.getState().diagram.entities.find((e) => e.id === "a")!;
    const handles = container.querySelectorAll('rect[data-no-pan="true"]');
    const rightHandle = handles[4]; // indice 0: area di trascinamento del contenitore; poi handlesFor: n, s, w, e, nw, ne, sw, se

    fireEvent.pointerDown(rightHandle, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(rightHandle, { clientX: 150, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(rightHandle, { clientX: 150, clientY: 100, pointerId: 1 });

    const bandAfter = useDiagramStore.getState().diagram.bands.find((b) => b.l === "Banda A")!;
    expect(bandAfter.w).toBe(bandBefore.w + 50);
    expect(bandAfter.x).toBe(bandBefore.x);
    expect(bandAfter.h).toBe(bandBefore.h);
    // l'entità non si è mossa: il resize del contenitore è indipendente dalle entità al suo interno
    expect(useDiagramStore.getState().diagram.entities.find((e) => e.id === "a")).toEqual(entityBefore);
  });

  it("modalità 'Seleziona': trascinare un'entità la sposta tramite moveEntity, senza spostare il canvas", () => {
    resetStore(fixture());
    render(<TestApp />);

    const g = screen.getByText("Entità A").closest("g")!;
    const stage = screen.getByRole("img", { name: "Schema architetturale" }).parentElement!;
    const transformBefore = stage.style.transform;

    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(g, { clientX: 140, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(g, { clientX: 140, clientY: 150, pointerId: 1 });

    expect(stage.style.transform).toBe(transformBefore);
    const entity = useDiagramStore.getState().diagram.entities.find((e) => e.id === "a")!;
    expect(entity.x).not.toBe(0);
    expect(entity.y).not.toBe(0);
    // spostare un'entità dentro lo stesso contenitore non deve ridimensionarlo
    expect(useDiagramStore.getState().diagram.bands).toEqual(fixture().bands);
  });

  it("modalità 'Seleziona': trascinare lo sfondo di un contenitore lo sposta insieme alle entità che contiene", () => {
    resetStore(fixture());
    const { container } = render(<TestApp />);

    const bandBefore = useDiagramStore.getState().diagram.bands.find((b) => b.l === "Banda A")!;
    const aBefore = useDiagramStore.getState().diagram.entities.find((e) => e.id === "a")!;
    const bBefore = useDiagramStore.getState().diagram.entities.find((e) => e.id === "b")!;
    const dragArea = container.querySelectorAll('rect[data-no-pan="true"]')[0]; // area di trascinamento del contenitore

    fireEvent.pointerDown(dragArea, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerMove(dragArea, { clientX: 140, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(dragArea, { clientX: 140, clientY: 80, pointerId: 1 });

    const diagram = useDiagramStore.getState().diagram;
    const bandAfter = diagram.bands.find((b) => b.l === "Banda A")!;
    const aAfter = diagram.entities.find((e) => e.id === "a")!;
    const bAfter = diagram.entities.find((e) => e.id === "b")!;
    expect(bandAfter.x).toBe(bandBefore.x + 40);
    expect(bandAfter.y).toBe(bandBefore.y - 20);
    expect(aAfter.x).toBe(aBefore.x + 40);
    expect(aAfter.y).toBe(aBefore.y - 20);
    expect(bAfter.x).toBe(bBefore.x + 40);
    expect(bAfter.y).toBe(bBefore.y - 20);
  });

  it("modalità 'Seleziona': trascinare la maniglia di un segmento interno di un collegamento lo modifica mantenendo gli angoli retti", () => {
    const diagram: Diagram = {
      bands: [{ l: "Banda A", x: 0, y: 0, w: 2000, h: 2000 }],
      entities: [
        { id: "a", n: "Entità A", band: "Banda A", x: 0, y: 0, mono: "A" },
        { id: "b", n: "Entità B", band: "Banda A", x: 400, y: 200, mono: "B" },
      ],
      edges: [
        {
          id: "e-a-b",
          a: "a",
          b: "b",
          d: [
            [240, 36],
            [320, 36],
            [320, 236],
            [400, 236],
          ],
        },
      ],
      flows: [],
      technologies: [],
      authKinds: { mi: "", tok: "", sec: "", per: "" },
      auth: [],
    };
    resetStore(diagram);
    const { container } = render(<TestApp />);

    // le maniglie compaiono solo dopo aver selezionato il collegamento (clic sulla sua hitbox invisibile)
    fireEvent.click(container.querySelector('path[stroke="transparent"]')!, { clientX: 300, clientY: 100 });

    // ordine delle maniglie circolari: punto medio dei segmenti 0,1,2, poi le due estremità a/b;
    // il segmento 1 è quello verticale interno (320,36)-(320,236), con punto medio (320,136).
    // Query delle maniglie scoped al solo svg del diagramma: l'header contiene anche lui elementi
    // <circle> (icona del tema chiaro/scuro), quindi una query non scoped sbaglierebbe indice.
    const canvasSvg = container.querySelector('svg[aria-label="Schema architetturale"]')!;
    const handle = canvasSvg.querySelectorAll("circle")[1];
    fireEvent.pointerDown(handle, { clientX: 320, clientY: 136, pointerId: 1, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 380, clientY: 136, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 380, clientY: 136, pointerId: 1 });

    const edge = useDiagramStore.getState().diagram.edges.find((e) => e.id === "e-a-b")!;
    expect(edge.d).toEqual([
      [240, 36],
      [380, 36],
      [380, 236],
      [400, 236],
    ]);
  });

  it("modalità 'Seleziona': un clic senza trascinamento seleziona l'entità invece di spostarla", () => {
    resetStore(fixture());
    render(<TestApp />);

    const g = screen.getByText("Entità A").closest("g")!;
    fireEvent.pointerDown(g, { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerUp(g, { clientX: 100, clientY: 100, pointerId: 1 });

    const entity = useDiagramStore.getState().diagram.entities.find((e) => e.id === "a")!;
    expect(entity.x).toBe(0);
    expect(entity.y).toBe(0);
  });

  it("Annulla ripristina lo stato precedente dopo una modifica", async () => {
    resetStore(fixture());
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Strumenti di modifica" }));
    await user.click(screen.getByRole("button", { name: "Elimina" }));
    fireEvent.click(screen.getByText("Entità A"));
    expect(useDiagramStore.getState().diagram.entities).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Annulla" }));
    expect(useDiagramStore.getState().diagram.entities).toHaveLength(2);
  });

  it("Ctrl+Z annulla l'ultima modifica e Ctrl+Shift+Z la ripristina", () => {
    resetStore(fixture());
    render(<TestApp />);

    useDiagramStore.getState().apply(deleteElement("entity", "a"));
    expect(useDiagramStore.getState().diagram.entities).toHaveLength(1);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(useDiagramStore.getState().diagram.entities).toHaveLength(2);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    expect(useDiagramStore.getState().diagram.entities).toHaveLength(1);
  });

  it("modalità 'Seleziona': trascinare l'etichetta di un collegamento la sposta tramite updateEdge", () => {
    resetStore(fixture(true));
    const { container } = render(<TestApp />);

    act(() => {
      useDiagramStore.getState().apply(updateEdge("e-a-b", { l: "chiamata", lx: 210, ly: 36 }));
    });

    const labelRect = container.querySelector('rect[stroke="none"]')!;
    fireEvent.pointerDown(labelRect, { clientX: 210, clientY: 36, pointerId: 1, button: 0 });
    fireEvent.pointerMove(labelRect, { clientX: 210, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(labelRect, { clientX: 210, clientY: 90, pointerId: 1 });

    const edge = useDiagramStore.getState().diagram.edges.find((e) => e.id === "e-a-b")!;
    expect(edge.lx).toBe(210);
    expect(edge.ly).toBe(90);
  });

  it("clic sull'icona di un'entità nel disegno apre il dialog e applica l'icona scelta", async () => {
    const single: Diagram = { ...fixture(), entities: [{ id: "a", n: "Entità A", band: "Banda A", x: 0, y: 0, mono: "A" }] };
    resetStore(single);
    const user = userEvent.setup();
    const { container } = render(<TestApp />);

    fireEvent.click(container.querySelector('g[style*="cursor: pointer"]')!);

    expect(await screen.findByPlaceholderText(/Cerca per nome/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "App Service" }));

    expect(useDiagramStore.getState().diagram.entities[0].icon).toBe("app");
    expect(useDiagramStore.getState().diagram.entities[0].mono).toBeUndefined();
    expect(screen.queryByPlaceholderText(/Cerca per nome/)).not.toBeInTheDocument();
  });

  it("clic sull'icona di un'entità nel pannello laterale apre il dialog; 'Nessuna' rigenera il monogramma dal nome", async () => {
    resetStore(fixture());
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: /^Entità/ }));
    await user.click(screen.getByRole("button", { name: /Entità A/ }));
    await user.click(screen.getByRole("button", { name: "Cambia icona" }));

    expect(await screen.findByPlaceholderText(/Cerca per nome/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "App Service" }));
    expect(useDiagramStore.getState().diagram.entities[0].icon).toBe("app");

    await user.click(screen.getByRole("button", { name: "Cambia icona" }));
    await user.click(screen.getByRole("button", { name: /Nessuna/ }));
    const updated = useDiagramStore.getState().diagram.entities[0];
    expect(updated.icon).toBeUndefined();
    expect(updated.mono).toBe("EA");
  });
});

describe("icona proposta dal nome", () => {
  it("segue il nome finché non si sceglie un'icona a mano", async () => {
    resetStore(fixture());
    const user = userEvent.setup();
    render(<TestApp />);

    await user.click(screen.getByRole("button", { name: "Strumenti di modifica" }));
    await user.click(screen.getByRole("button", { name: "Nuovo" }));
    await user.click(screen.getByRole("button", { name: "Entità" }));
    fireEvent.click(screen.getByText("Banda A"));

    await user.type(await screen.findByLabelText("Nome *"), "Key Vault");
    expect(screen.getByText(/Icona proposta dal nome/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Crea" }));

    expect(useDiagramStore.getState().diagram.entities.find((e) => e.n === "Key Vault")?.icon).toBe("kv");
  });
});
