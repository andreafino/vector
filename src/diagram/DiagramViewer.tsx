import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Diagram, Point } from "../types/diagram";
import { entityById } from "../data/loadDiagram";
import { useDiagramStore } from "../store/useDiagramStore";
import type { Version } from "../store/diagramStore";
import {
  addBand,
  addEdge,
  addEntity,
  addEntityModule,
  addTechnology,
  deleteElement,
  deleteEntityModule,
  moveBand,
  moveEntity,
  reanchorEdge,
  resizeBandManually,
  updateEdge,
  updateEntity,
  updateEntityModule,
  updateTechnology,
} from "../commands/commands";
import type { BandResizeEdges } from "./geometry";
import { uniqueId, slugify, monogram } from "./ids";
import { orthogonalEdgePath, midpointOfPath, clampEntityPosition, ENTITY_WIDTH, DEFAULT_ENTITY_HEIGHT } from "./geometry";
import { useDiagramState } from "./useDiagramState";
import { useZoomPan } from "./useZoomPan";
import { computeBounds } from "./geometry";
import { DiagramCanvas } from "./DiagramCanvas";
import { Sidebar } from "./Sidebar";
import { EditingToolbar } from "./EditingToolbar";
import { EntityCreateForm, EdgeCreateForm, BandCreateForm, TechnologyCreateForm } from "./EditForms";
import { IconChangeDialog } from "./IconChangeDialog";
import type { EditMode, Theme } from "./types";
import { fromFileContents, toFileContents } from "../persistence/diagramFile";
import { downloadBlob, isAbort, openDiagramFile, saveDiagramFile, type FileSystemFileHandleLike } from "../persistence/localFileStore";
import { requestDiagramPdf, type PdfQuality } from "./exportPdf";
import { readStoredTheme, writeStoredTheme } from "../theme/themeStorage";
import { EMPTY_DIAGRAM } from "./emptyDiagram";
import { ChatIcon, ExpandSidebarIcon, MoonIcon, SunIcon } from "./icons";
import { ChatPanel } from "../chat/ChatPanel";
import { connectMcpBridge } from "../mcp/mcpBridge";
import { McpPanel } from "../mcp/McpPanel";

interface Props {
  diagram: Diagram;
  title: string;
  subtitle: string;
  inTeams: boolean;
}

interface PendingEntityPopover {
  banda: string;
  x: number;
  y: number;
}

interface PendingEdgePopover {
  aId: string;
  bId: string;
  clientX: number;
  clientY: number;
}

interface PendingBandPopover {
  x: number;
  y: number;
}

export function DiagramViewer({ diagram, title, subtitle, inTeams }: Props) {
  const { tab, setTab, sel, hop, setHop, playing, select, clearSel, togglePlay, nextHop, prevHop, curFlow, curFlowSteps, highlight } = useDiagramState(diagram);
  const { width, height } = computeBounds(diagram);
  const { viewportRef, stageRef, zoomLabel, zoomIn, zoomOut, fit } = useZoomPan(width, height);
  const [theme, setTheme] = useState<Theme>(() => (!inTeams && readStoredTheme()) || "light");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const hasDesktopApi = typeof window !== "undefined" && !!window.vectorDesktop;

  useEffect(() => connectMcpBridge(), []);

  const apply = useDiagramStore((s) => s.apply);
  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const goto = useDiagramStore((s) => s.goto);
  const versions = useDiagramStore((s) => s.versions);
  const historyIndex = useDiagramStore((s) => s.index);
  const hydrate = useDiagramStore((s) => s.hydrate);

  // Istantanea di versioni/indice all'ultimo apri/salva: confrontata (in un effect, non durante il
  // render) con lo stato corrente per sapere se ci sono modifiche non salvate, senza dover intercettare
  // ogni singola apply().
  const lastSavedRef = useRef<{ versions: Version[]; index: number }>({ versions, index: historyIndex });
  const [isDirty, setIsDirty] = useState(false);
  useEffect(() => {
    setIsDirty(versions !== lastSavedRef.current.versions || historyIndex !== lastSavedRef.current.index);
  }, [versions, historyIndex]);

  const [fileHandle, setFileHandle] = useState<FileSystemFileHandleLike | undefined>();
  const [fileMessage, setFileMessage] = useState<string | null>(null);

  const handleOpenFile = async () => {
    try {
      const { data, handle } = await openDiagramFile();
      const { versions: loadedVersions, index: loadedIndex, title: loadedTitle } = fromFileContents(data);
      hydrate(loadedVersions, loadedIndex);
      setFileHandle(handle);
      setFileMessage(null);
      setDisplayTitle(loadedTitle ?? title);
      lastSavedRef.current = { versions: loadedVersions, index: loadedIndex };
      setIsDirty(false);
    } catch (err) {
      if (isAbort(err)) return;
      setFileMessage(err instanceof Error ? err.message : "Apertura del file non riuscita.");
    }
  };

  const handleSaveFile = useCallback(async (): Promise<boolean> => {
    try {
      const state = useDiagramStore.getState();
      const data = toFileContents({ versions: state.versions, index: state.index, title: displayTitle });
      const handle = await saveDiagramFile(data, fileHandle);
      setFileHandle(handle);
      setFileMessage(null);
      lastSavedRef.current = { versions: state.versions, index: state.index };
      setIsDirty(false);
      return true;
    } catch (err) {
      if (isAbort(err)) return false;
      setFileMessage(err instanceof Error ? err.message : "Salvataggio del file non riuscito.");
      return false;
    }
  }, [displayTitle, fileHandle]);

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [qualityDialogOpen, setQualityDialogOpen] = useState(false);
  const handleExportPdf = useCallback(
    async (quality: PdfQuality) => {
      const svgEl = stageRef.current?.querySelector("svg");
      if (!svgEl) return;
      setIsExportingPdf(true);
      try {
        const blob = await requestDiagramPdf(diagram, svgEl, displayTitle, quality);
        downloadBlob(blob, `${slugify(displayTitle)}.pdf`);
        setFileMessage(null);
      } catch (err) {
        setFileMessage(err instanceof Error ? err.message : "Esportazione PDF non riuscita.");
      } finally {
        setIsExportingPdf(false);
      }
    },
    [diagram, displayTitle, stageRef]
  );
  const chooseExportQuality = (quality: PdfQuality) => {
    setQualityDialogOpen(false);
    void handleExportPdf(quality);
  };

  const resetToNewDiagram = () => {
    const version: Version = { numero: 0, diagramma: EMPTY_DIAGRAM, descrizione: "Nuovo diagramma", origine: "manuale", autore: "Utente", data: new Date().toISOString() };
    hydrate([version], 0);
    setFileHandle(undefined);
    setFileMessage(null);
    setDisplayTitle("Nuovo diagramma");
    lastSavedRef.current = { versions: [version], index: 0 };
    setIsDirty(false);
  };

  const handleNewDiagramClick = () => {
    if (isDirty) setConfirmNewOpen(true);
    else resetToNewDiagram();
  };

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    setDisplayTitle(trimmed || displayTitle);
    setEditingTitle(false);
  };

  const [mode, setMode] = useState<EditMode>("select");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [entityPopover, setEntityPopover] = useState<PendingEntityPopover | null>(null);
  const [edgePopover, setEdgePopover] = useState<PendingEdgePopover | null>(null);
  const [bandPopover, setBandPopover] = useState<PendingBandPopover | null>(null);
  const [technologyPanelOpen, setTechnologyPanelOpen] = useState(false);
  const [iconDialogTarget, setIconDialogTarget] = useState<{ kind: "entity" | "technology"; id: string } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!inTeams) writeStoredTheme(theme);
  }, [theme, inTeams]);

  useEffect(() => {
    setConnectFrom(null);
    setSelectedEdgeId(null);
    setEntityPopover(null);
    setEdgePopover(null);
    setBandPopover(null);
  }, [mode]);

  // Ctrl/Cmd+Z annulla (Ctrl/Cmd+Shift+Z o Ctrl/Cmd+Y ripete), Ctrl/Cmd+S salva, Canc elimina la
  // selezione corrente — tutto disattivo mentre si scrive in un campo.
  useEffect(() => {
    const handler = (evt: KeyboardEvent) => {
      const target = evt.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;

      if (evt.ctrlKey || evt.metaKey) {
        const key = evt.key.toLowerCase();
        if (key === "z") {
          evt.preventDefault();
          if (evt.shiftKey) redo();
          else undo();
        } else if (key === "y") {
          evt.preventDefault();
          redo();
        } else if (key === "s") {
          evt.preventDefault();
          void handleSaveFile();
        }
        return;
      }

      if (evt.key === "Delete") {
        if (sel?.kind === "entity") {
          evt.preventDefault();
          apply(deleteElement("entity", sel.id));
          clearSel();
        } else if (sel?.kind === "tech") {
          evt.preventDefault();
          apply(deleteElement("technology", sel.id));
          clearSel();
        } else if (selectedEdgeId) {
          evt.preventDefault();
          apply(deleteElement("edge", selectedEdgeId));
          setSelectedEdgeId(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, handleSaveFile, sel, selectedEdgeId, apply, clearSel]);

  const handleEntityClick = (id: string, evt: { clientX: number; clientY: number }) => {
    if (mode === "select") {
      select("entity", id, "entities");
      return;
    }
    if (mode === "delete") {
      apply(deleteElement("entity", id));
      if (sel?.kind === "entity" && sel.id === id) clearSel();
      return;
    }
    if (mode === "connect") {
      if (!connectFrom) {
        setConnectFrom(id);
        return;
      }
      if (connectFrom === id) {
        setConnectFrom(null);
        return;
      }
      setEdgePopover({ aId: connectFrom, bId: id, clientX: evt.clientX, clientY: evt.clientY });
      setConnectFrom(null);
    }
  };

  const handleEdgeClick = (id: string) => {
    if (mode === "delete") apply(deleteElement("edge", id));
  };

  const handleBandClick = (label: string, point: { x: number; y: number }) => {
    if (mode === "add-entity") {
      const band = diagram.bands.find((b) => b.l === label);
      const placed = band ? clampEntityPosition(band, point.x - ENTITY_WIDTH / 2, point.y - DEFAULT_ENTITY_HEIGHT / 2) : { x: Math.round(point.x), y: Math.round(point.y) };
      setEntityPopover({ banda: label, x: placed.x, y: placed.y });
    }
  };

  const handleEntityDragEnd = (id: string, x: number, y: number, candidateBand: string | undefined) => {
    const entity = diagram.entities.find((e) => e.id === id);
    if (!entity) return;
    const targetBand = diagram.bands.find((b) => b.l === (candidateBand ?? entity.band));
    const placed = targetBand ? clampEntityPosition(targetBand, x, y, entity.h) : { x: Math.round(x), y: Math.round(y) };
    apply(moveEntity(id, placed.x, placed.y, candidateBand));
  };

  const handleBackgroundClick = (point: { x: number; y: number }) => {
    if (mode === "add-container") {
      setBandPopover({ x: point.x, y: point.y });
    }
  };

  const handleBandResizeEnd = (label: string, edges: BandResizeEdges, dx: number, dy: number) => {
    apply(resizeBandManually(label, edges, dx, dy));
  };

  const handleBandDragEnd = (label: string, dx: number, dy: number) => {
    apply(moveBand(label, dx, dy));
  };

  const handleEdgePathChange = (id: string, points: Point[]) => {
    apply(updateEdge(id, { d: points }));
  };

  const handleEdgeReanchor = (id: string, end: "a" | "b", entityId: string, x: number, y: number) => {
    apply(reanchorEdge(id, end, entityId, x, y));
  };

  const handleEdgeLabelDragEnd = (id: string, lx: number, ly: number) => {
    apply(updateEdge(id, { lx, ly }));
  };

  let statusKicker = "Esplora lo schema";
  let statusText = "Seleziona un flusso, un'entità o una tecnologia";
  if (mode !== "select") {
    statusKicker = { "add-entity": "Nuova entità", "add-container": "Nuovo contenitore", connect: "Collega due entità", delete: "Elimina" }[mode] ?? statusKicker;
    statusText =
      mode === "add-entity"
        ? "Clic su uno dei contenitori illuminati per posizionare la nuova entità"
        : mode === "add-container"
          ? "Clic su un punto del disegno per posizionare il nuovo contenitore"
          : mode === "connect"
            ? connectFrom
              ? `Scegli l'entità di arrivo per "${entityById(diagram, connectFrom)?.n ?? connectFrom}"`
              : "Clic sulla prima entità da collegare"
            : "Clic su un'entità o un collegamento per eliminarlo";
  } else if (curFlow) {
    const step = curFlowSteps[hop];
    const flowIndex = diagram.flows.indexOf(curFlow);
    statusKicker = `Flusso ${String(flowIndex + 1).padStart(2, "0")} · ${curFlow.t} · passo ${hop + 1} di ${curFlowSteps.length}`;
    if (step) statusText = `${entityById(diagram, step.from)?.n ?? step.from} → ${entityById(diagram, step.to)?.n ?? step.to}: ${step.label}`;
  } else if (sel?.kind === "entity") {
    statusKicker = "Entità";
    statusText = `${entityById(diagram, sel.id)?.n ?? sel.id} e i suoi collegamenti diretti`;
  } else if (sel?.kind === "tech") {
    const t = diagram.technologies.find((x) => x.id === sel.id);
    statusKicker = "Tecnologia";
    statusText = t ? `${t.n}: ${t.e.map((id) => entityById(diagram, id)?.n ?? id).join(", ")}` : statusText;
  }

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "auto minmax(0,1fr)", background: "var(--paper)", color: "var(--ink)", fontFamily: "'Source Sans 3','Segoe UI',system-ui,sans-serif", fontSize: 15, lineHeight: 1.45 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 24px", borderBottom: "3px solid var(--accent)" }}>
        <img src={`${import.meta.env.BASE_URL}vector-logo.png`} alt="Vector" width={48} height={48} style={{ display: "block", flex: "none", alignSelf: "center" }} />
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--rule)" }} />
        <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent-ink)" }}>{subtitle}</div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              style={{
                margin: 0,
                fontFamily: "'Barlow Semi Condensed',sans-serif",
                fontWeight: 700,
                fontSize: 24,
                lineHeight: 1.15,
                border: "1px solid var(--accent)",
                borderRadius: 4,
                padding: "0 4px",
                background: "var(--paper)",
                color: "var(--ink)",
                width: "100%",
              }}
            />
          ) : (
            <h1
              onDoubleClick={() => {
                setTitleDraft(displayTitle);
                setEditingTitle(true);
              }}
              title="Doppio clic per rinominare"
              style={{ margin: 0, fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 700, fontSize: 24, lineHeight: 1.15, cursor: "text" }}
            >
              {displayTitle}
            </h1>
          )}
        </div>
        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "var(--panel)", flex: "none" }}>
          {(["light", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              title={t === "light" ? "Tema chiaro" : "Tema scuro"}
              aria-label={t === "light" ? "Tema chiaro" : "Tema scuro"}
              style={{
                border: 0,
                borderRadius: 6,
                padding: "6px 10px",
                display: "grid",
                placeItems: "center",
                background: theme === t ? "var(--card)" : "transparent",
                color: theme === t ? "var(--ink)" : "var(--muted)",
                cursor: "pointer",
                boxShadow: theme === t ? "0 1px 2px rgba(56,47,45,.15)" : "none",
              }}
            >
              {t === "light" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </button>
          ))}
        </div>
        {hasDesktopApi && (
          <button
            onClick={() => setMcpOpen((v) => !v)}
            title="Assistente esterno (MCP)"
            aria-label="Assistente esterno (MCP)"
            style={{
              border: "1px solid var(--rule)",
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "'Barlow Semi Condensed',sans-serif",
              fontWeight: 600,
              background: mcpOpen ? "var(--accent)" : "var(--panel)",
              color: mcpOpen ? "#fff" : "var(--ink)",
              cursor: "pointer",
              flex: "none",
            }}
          >
            MCP
          </button>
        )}
        <button
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? "Chiudi assistente" : "Apri assistente"}
          aria-label={chatOpen ? "Chiudi assistente" : "Apri assistente"}
          style={{
            border: "1px solid var(--rule)",
            borderRadius: 8,
            padding: "6px 10px",
            display: "grid",
            placeItems: "center",
            background: chatOpen ? "var(--accent)" : "var(--panel)",
            color: chatOpen ? "#fff" : "var(--ink)",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <ChatIcon size={18} />
        </button>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${sidebarCollapsed ? "minmax(0,1fr)" : "minmax(300px,380px) minmax(0,1fr)"}${chatOpen ? " 340px" : ""}`,
          minHeight: 0,
        }}
      >
        {!sidebarCollapsed && (
          <Sidebar
            diagram={diagram}
            tab={tab}
            setTab={setTab}
            sel={sel}
            hop={hop}
            setHop={setHop}
            playing={playing}
            select={select}
            togglePlay={togglePlay}
            nextHop={nextHop}
            prevHop={prevHop}
            onUpdateEntity={(id, patch, technologyIds, newTechnologies) =>
              apply(updateEntity(id, patch, technologyIds, newTechnologies?.map((t) => ({ ...t, e: [] }))))
            }
            onDeleteEntity={(id) => {
              apply(deleteElement("entity", id));
              if (sel?.kind === "entity" && sel.id === id) clearSel();
            }}
            onAddEntityModule={(entityId, titolo, sottotitolo) => {
              const moduleId = uniqueId(`${entityId}.${slugify(titolo)}`, (candidate) => diagram.entities.find((e) => e.id === entityId)?.mods?.some((m) => m.id === candidate) ?? false);
              apply(addEntityModule(entityId, { id: moduleId, t: titolo, s: sottotitolo }));
            }}
            onUpdateEntityModule={(entityId, moduleId, patch) => apply(updateEntityModule(entityId, moduleId, patch))}
            onDeleteEntityModule={(entityId, moduleId) => apply(deleteEntityModule(entityId, moduleId))}
            onEditEntityIcon={(entityId) => setIconDialogTarget({ kind: "entity", id: entityId })}
            onEditTechnologyIcon={(technologyId) => setIconDialogTarget({ kind: "technology", id: technologyId })}
            onCollapse={() => setSidebarCollapsed(true)}
            onNewTechnology={() => setTechnologyPanelOpen(true)}
          />
        )}
        {sidebarCollapsed && (
          <button
            title="Espandi pannello"
            aria-label="Espandi pannello"
            onClick={() => setSidebarCollapsed(false)}
            style={{
              position: "fixed",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 12,
              border: "1px solid var(--rule)",
              borderLeft: "none",
              borderRadius: "0 8px 8px 0",
              background: "var(--card)",
              color: "var(--ink)",
              cursor: "pointer",
              padding: "10px 6px",
              boxShadow: "0 4px 16px rgba(0,0,0,.15)",
            }}
          >
            <ExpandSidebarIcon size={18} />
          </button>
        )}
        <div style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr)", minHeight: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 20px", padding: "10px 20px", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ display: "grid", gap: 1, minWidth: 0, flex: 1 }}>
              <span style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent-ink)" }}>{statusKicker}</span>
              <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{statusText}</span>
            </div>
            {fileMessage && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--accent-ink)", background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 6, padding: "6px 12px" }}>
                {fileMessage}
                <button onClick={() => setFileMessage(null)} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 }}>
                  ✕
                </button>
              </div>
            )}
            {sel && mode === "select" && (
              <button onClick={clearSel} style={{ border: "1px solid var(--rule)", borderRadius: 6, padding: "5px 12px", fontSize: 13, background: "var(--card)", cursor: "pointer", color: "var(--ink)" }}>
                Azzera
              </button>
            )}
            <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8, background: "var(--panel)" }}>
              <button onClick={zoomOut} style={zoomBtn}>
                −
              </button>
              <button onClick={fit} style={{ ...zoomBtn, minWidth: 48, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
                {zoomLabel}
              </button>
              <button onClick={zoomIn} style={zoomBtn}>
                +
              </button>
            </div>
          </div>
          <div ref={viewportRef} style={{ position: "relative", overflow: "hidden", minHeight: 0, background: "var(--paper)", cursor: mode === "select" ? "grab" : "default", touchAction: "none" }}>
            <div ref={stageRef} style={{ position: "absolute", top: 0, left: 0, transformOrigin: "0 0" }}>
              <DiagramCanvas
                diagram={diagram}
                highlight={mode === "select" ? highlight : null}
                mode={mode}
                connectFrom={connectFrom}
                selectedEdgeId={selectedEdgeId}
                onEntityClick={handleEntityClick}
                onEntityIconClick={(id) => setIconDialogTarget({ kind: "entity", id })}
                onEntityDragEnd={handleEntityDragEnd}
                onEdgeClick={handleEdgeClick}
                onEdgeSelect={setSelectedEdgeId}
                onEdgePathChange={handleEdgePathChange}
                onEdgeReanchor={handleEdgeReanchor}
                onEdgeLabelDragEnd={handleEdgeLabelDragEnd}
                onBandClick={handleBandClick}
                onBandResizeEnd={handleBandResizeEnd}
                onBandDragEnd={handleBandDragEnd}
                onBackgroundClick={handleBackgroundClick}
              />
            </div>
            <div style={{ position: "absolute", left: 16, bottom: 12, fontSize: 12, color: "var(--muted)", background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 6, padding: "4px 10px", pointerEvents: "none" }}>
              Rotella: zoom · rotella premuta o trascina: sposta · clic sulla % per adattare
            </div>
          </div>
        </div>
        {chatOpen && <ChatPanel />}
      </div>

      {mcpOpen && hasDesktopApi && <McpPanel onClose={() => setMcpOpen(false)} />}

      {entityPopover && (
        <EntityCreateForm
          diagram={diagram}
          banda={entityPopover.banda}
          onCancel={() => setEntityPopover(null)}
          onSubmit={({ nome, sottotitolo, descrizione, icon, technologyIds, newTechnologies }) => {
            const id = uniqueId(slugify(nome), (candidate) => diagram.entities.some((e) => e.id === candidate));
            apply(
              addEntity(
                {
                  id,
                  n: nome,
                  band: entityPopover.banda,
                  x: Math.round(entityPopover.x),
                  y: Math.round(entityPopover.y),
                  icon,
                  mono: icon ? undefined : monogram(nome),
                  s: sottotitolo ? [sottotitolo] : undefined,
                  desc: descrizione || undefined,
                },
                technologyIds,
                newTechnologies.map((t) => ({ ...t, e: [] }))
              )
            );
            setEntityPopover(null);
          }}
        />
      )}

      {bandPopover && (
        <BandCreateForm
          onCancel={() => setBandPopover(null)}
          onSubmit={({ etichetta }) => {
            apply(
              addBand({
                l: etichetta,
                x: Math.round(bandPopover.x),
                y: Math.round(bandPopover.y),
                w: 280,
                h: 160,
              })
            );
            setBandPopover(null);
          }}
        />
      )}

      {technologyPanelOpen && (
        <TechnologyCreateForm
          diagram={diagram}
          onCancel={() => setTechnologyPanelOpen(false)}
          onSubmit={({ nome, gruppo, descrizione, icon, entityIds }) => {
            const id = uniqueId(slugify(nome), (candidate) => diagram.technologies.some((t) => t.id === candidate));
            apply(
              addTechnology({
                id,
                g: gruppo || "Tecnologie",
                n: nome,
                icon,
                mono: icon ? undefined : monogram(nome),
                e: entityIds,
                d: descrizione,
              })
            );
            setTechnologyPanelOpen(false);
          }}
        />
      )}

      {iconDialogTarget &&
        (() => {
          const current =
            iconDialogTarget.kind === "entity"
              ? diagram.entities.find((e) => e.id === iconDialogTarget.id)
              : diagram.technologies.find((t) => t.id === iconDialogTarget.id);
          if (!current) return null;
          return (
            <IconChangeDialog
              title={current.n}
              value={current.icon}
              onCancel={() => setIconDialogTarget(null)}
              onSelect={(icon) => {
                const patch = { icon, mono: icon ? undefined : (current.mono ?? monogram(current.n)) };
                if (iconDialogTarget.kind === "entity") apply(updateEntity(iconDialogTarget.id, patch));
                else apply(updateTechnology(iconDialogTarget.id, patch));
                setIconDialogTarget(null);
              }}
            />
          );
        })()}

      {edgePopover && (
        <EdgeCreateForm
          diagram={diagram}
          aId={edgePopover.aId}
          bId={edgePopover.bId}
          clientX={edgePopover.clientX}
          clientY={edgePopover.clientY}
          onCancel={() => setEdgePopover(null)}
          onSubmit={({ etichetta, bidirezionale }) => {
            const a = diagram.entities.find((e) => e.id === edgePopover.aId);
            const b = diagram.entities.find((e) => e.id === edgePopover.bId);
            if (a && b) {
              const d = orthogonalEdgePath(a, b);
              const [midX, midY] = midpointOfPath(d);
              const mid = { x: midX, y: midY };
              const id = uniqueId(`e-${a.id}-${b.id}`, (candidate) => diagram.edges.some((e) => e.id === candidate));
              apply(
                addEdge({
                  id,
                  a: a.id,
                  b: b.id,
                  d,
                  l: etichetta || undefined,
                  lx: etichetta ? mid.x : undefined,
                  ly: etichetta ? mid.y : undefined,
                  bi: bidirezionale || undefined,
                })
              );
            }
            setEdgePopover(null);
          }}
        />
      )}

      {confirmNewOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,.35)" }} onClick={() => setConfirmNewOpen(false)} />
          <div
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 31,
              background: "var(--card)",
              border: "1px solid var(--rule)",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,.25)",
              padding: 20,
              width: 340,
              display: "grid",
              gap: 14,
            }}
          >
            <strong style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontSize: 16 }}>Diagramma non salvato</strong>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>Ci sono modifiche non salvate. Vuoi salvarle prima di aprire un nuovo diagramma?</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmNewOpen(false)}
                style={{ border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 12px", fontSize: 13, background: "var(--paper)", cursor: "pointer", color: "var(--ink)" }}
              >
                Annulla
              </button>
              <button
                onClick={() => {
                  setConfirmNewOpen(false);
                  resetToNewDiagram();
                }}
                style={{ border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 12px", fontSize: 13, background: "var(--paper)", cursor: "pointer", color: "var(--ink)" }}
              >
                Non salvare
              </button>
              <button
                onClick={async () => {
                  const ok = await handleSaveFile();
                  setConfirmNewOpen(false);
                  if (ok) resetToNewDiagram();
                }}
                style={{ border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 13, background: "var(--accent)", color: "#fff", cursor: "pointer", fontWeight: 600 }}
              >
                Salva
              </button>
            </div>
          </div>
        </>
      )}

      {qualityDialogOpen && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,.35)" }} onClick={() => setQualityDialogOpen(false)} />
          <div
            style={{
              position: "fixed",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 31,
              background: "var(--card)",
              border: "1px solid var(--rule)",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,.25)",
              padding: 20,
              width: 340,
              display: "grid",
              gap: 14,
            }}
          >
            <strong style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontSize: 16 }}>Qualità di stampa</strong>
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>Una qualità più alta produce un PDF più nitido (anche zoommando), ma più pesante e lento da generare.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {(
                [
                  { quality: "low" as const, label: "Bassa", hint: "600 DPI · qualità di stampa standard" },
                  { quality: "medium" as const, label: "Media", hint: "1200 DPI · alta nitidezza" },
                  { quality: "high" as const, label: "Alta", hint: "2400 DPI · massima nitidezza, file più pesante" },
                ]
              ).map(({ quality, label, hint }) => (
                <button
                  key={quality}
                  onClick={() => chooseExportQuality(quality)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 2,
                    border: "1px solid var(--rule)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    background: "var(--paper)",
                    cursor: "pointer",
                    color: "var(--ink)",
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</span>
                </button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setQualityDialogOpen(false)}
                style={{ border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 12px", fontSize: 13, background: "var(--paper)", cursor: "pointer", color: "var(--ink)" }}
              >
                Annulla
              </button>
            </div>
          </div>
        </>
      )}

      <EditingToolbar
        mode={mode}
        setMode={setMode}
        versions={versions}
        index={historyIndex}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < versions.length - 1}
        undo={undo}
        redo={redo}
        goto={goto}
        onNewDiagram={handleNewDiagramClick}
        onOpenFile={handleOpenFile}
        onSaveFile={handleSaveFile}
        onExportPdf={() => setQualityDialogOpen(true)}
        exportingPdf={isExportingPdf}
        hasFileHandle={!!fileHandle}
        rightOffset={chatOpen ? 360 : 20}
      />
    </div>
  );
}

const zoomBtn: CSSProperties = { border: 0, borderRadius: 6, padding: "5px 12px", fontSize: 15, background: "transparent", color: "var(--ink)", cursor: "pointer" };
