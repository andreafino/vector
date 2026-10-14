import { useState, type CSSProperties } from "react";
import type { Version } from "../store/diagramStore";
import type { EditMode } from "./types";
import { AddEntityIcon, ConnectIcon, ContainerIcon, CursorIcon, DeleteIcon, EntityIcon, HistoryIcon, NewFileIcon, OpenFileIcon, PrinterIcon, RedoIcon, SaveFileIcon, SpinnerIcon, ToolsIcon, UndoIcon } from "./icons";

interface Props {
  mode: EditMode;
  setMode: (m: EditMode) => void;
  versions: Version[];
  index: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  goto: (i: number) => void;
  onNewDiagram: () => void;
  onOpenFile: () => void;
  onSaveFile: () => void;
  onExportPdf: () => void;
  exportingPdf?: boolean;
  hasFileHandle: boolean;
  rightOffset?: number;
}

const addModes: EditMode[] = ["add-entity", "add-container"];

export function EditingToolbar({ mode, setMode, versions, index, canUndo, canRedo, undo, redo, goto, onNewDiagram, onOpenFile, onSaveFile, onExportPdf, exportingPdf = false, hasFileHandle, rightOffset = 20 }: Props) {
  const [open, setOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const chooseAdd = (m: EditMode) => {
    setMode(m);
    setAddMenuOpen(false);
  };

  return (
    <div style={{ position: "fixed", right: rightOffset, bottom: 20, zIndex: 15, display: "flex", flexDirection: "row-reverse", alignItems: "center" }}>
      {!open ? (
        <button onClick={() => setOpen(true)} title="Strumenti di modifica" style={fab(mode !== "select")}>
          <ToolsIcon size={22} />
        </button>
      ) : (
        <div style={panel}>
          <button onClick={() => setOpen(false)} title="Chiudi strumenti" style={toolBtn(false)}>
            <ToolsIcon size={20} />
          </button>
          <div style={divider} />
          <button title="Seleziona" aria-label="Seleziona" onClick={() => setMode("select")} style={toolBtn(mode === "select")}>
            <CursorIcon size={20} />
          </button>
          <div style={{ position: "relative" }}>
            <button title="Nuovo" aria-label="Nuovo" onClick={() => setAddMenuOpen((v) => !v)} style={toolBtn(addModes.includes(mode) || addMenuOpen)}>
              <AddEntityIcon size={20} />
            </button>
            {addMenuOpen && (
              <div style={addMenu}>
                <button onClick={() => chooseAdd("add-entity")} style={addMenuItem}>
                  <EntityIcon size={18} />
                  Entità
                </button>
                <button onClick={() => chooseAdd("add-container")} style={addMenuItem}>
                  <ContainerIcon size={18} />
                  Contenitore
                </button>
              </div>
            )}
          </div>
          <button title="Collega" aria-label="Collega" onClick={() => setMode("connect")} style={toolBtn(mode === "connect")}>
            <ConnectIcon size={20} />
          </button>
          <button title="Elimina" aria-label="Elimina" onClick={() => setMode("delete")} style={toolBtn(mode === "delete")}>
            <DeleteIcon size={20} />
          </button>
          <div style={divider} />
          <button title="Annulla" aria-label="Annulla" onClick={undo} disabled={!canUndo} style={toolBtn(false, canUndo)}>
            <UndoIcon size={20} />
          </button>
          <button title="Ripeti" aria-label="Ripeti" onClick={redo} disabled={!canRedo} style={toolBtn(false, canRedo)}>
            <RedoIcon size={20} />
          </button>
          <div style={{ position: "relative" }}>
            <button title={`Storico (${versions.length})`} aria-label="Storico" onClick={() => setHistoryOpen((v) => !v)} style={toolBtn(historyOpen)}>
              <HistoryIcon size={20} />
            </button>
            {historyOpen && (
              <div style={historyPanel}>
                {versions
                  .map((v, i) => ({ v, i }))
                  .reverse()
                  .map(({ v, i }) => (
                    <button
                      key={v.numero}
                      onClick={() => {
                        goto(i);
                        setHistoryOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: 0,
                        borderBottom: "1px solid var(--rule)",
                        padding: "8px 12px",
                        background: i === index ? "var(--accent-soft)" : "transparent",
                        cursor: "pointer",
                        color: "var(--ink)",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: i === index ? 700 : 400 }}>
                        v{v.numero} · {v.descrizione}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>
                        {v.origine} · {v.autore} · {new Date(v.data).toLocaleTimeString("it-IT")}
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>
          <div style={divider} />
          <button title="Nuovo diagramma" aria-label="Nuovo diagramma" onClick={onNewDiagram} style={toolBtn(false)}>
            <NewFileIcon size={20} />
          </button>
          <button title="Apri file…" aria-label="Apri file" onClick={onOpenFile} style={toolBtn(false)}>
            <OpenFileIcon size={20} />
          </button>
          <button title={hasFileHandle ? "Salva" : "Salva come…"} aria-label="Salva" onClick={onSaveFile} style={toolBtn(false)}>
            <SaveFileIcon size={20} />
          </button>
          <button title={exportingPdf ? "Generazione PDF in corso…" : "Esporta PDF"} aria-label="Esporta PDF" onClick={onExportPdf} disabled={exportingPdf} style={toolBtn(false, !exportingPdf)}>
            {exportingPdf ? <SpinnerIcon size={20} /> : <PrinterIcon size={20} />}
          </button>
        </div>
      )}
    </div>
  );
}

const panel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: 6,
  borderRadius: 999,
  background: "var(--card)",
  border: "1px solid var(--rule)",
  boxShadow: "0 8px 24px rgba(0,0,0,.18)",
};

const divider: CSSProperties = { width: 1, height: 24, background: "var(--rule)", margin: "0 2px" };

function fab(active: boolean): CSSProperties {
  return {
    width: 48,
    height: 48,
    borderRadius: "50%",
    border: "1px solid var(--rule)",
    background: active ? "var(--accent)" : "var(--card)",
    color: active ? "#fff" : "var(--ink)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(0,0,0,.18)",
  };
}

function toolBtn(active: boolean, enabled = true): CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: 0,
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : enabled ? "var(--ink)" : "var(--muted)",
    display: "grid",
    placeItems: "center",
    cursor: enabled ? "pointer" : "default",
    opacity: enabled ? 1 : 0.4,
  };
}

const historyPanel: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  right: 0,
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: 8,
  boxShadow: "0 4px 16px rgba(0,0,0,.15)",
  zIndex: 10,
  minWidth: 260,
  maxHeight: 320,
  overflowY: "auto",
};

const addMenu: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  left: "50%",
  transform: "translateX(-50%)",
  background: "var(--card)",
  border: "1px solid var(--rule)",
  borderRadius: 10,
  boxShadow: "0 4px 16px rgba(0,0,0,.15)",
  zIndex: 10,
  padding: 6,
  display: "grid",
  gap: 2,
  minWidth: 160,
};

const addMenuItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: 0,
  borderRadius: 6,
  padding: "8px 10px",
  background: "transparent",
  color: "var(--ink)",
  fontSize: 13.5,
  cursor: "pointer",
  textAlign: "left",
  whiteSpace: "nowrap",
};
