import { useState, type CSSProperties, type ReactNode } from "react";
import type { Diagram, Flow, FlowStepRaw } from "../types/diagram";
import { entityById } from "../data/loadDiagram";
import { directionFor, findEdgesBetween } from "./flowSteps";

const smallBtn: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "5px 10px", fontSize: 12.5, background: "var(--paper)", cursor: "pointer", color: "var(--ink)" };
const primaryBtn = (enabled: boolean): CSSProperties => ({ ...smallBtn, background: "var(--accent)", color: "#fff", border: 0, fontWeight: 600, opacity: enabled ? 1 : 0.5, cursor: enabled ? "pointer" : "default" });

function nameOf(diagram: Diagram, id: string) {
  return entityById(diagram, id)?.n ?? id;
}

export function FlowEditForm({
  diagram,
  flow,
  onCancel,
  onSave,
}: {
  diagram: Diagram;
  flow: Flow;
  onCancel: () => void;
  onSave: (patch: { t: string; g: string; w: string; note: string | undefined }) => void;
}) {
  const [t, setT] = useState(flow.t);
  const [g, setG] = useState(flow.g);
  const [w, setW] = useState(flow.w);
  const [note, setNote] = useState(flow.note ?? "");
  const inputStyle: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 8px", fontSize: 13.5, background: "var(--paper)", color: "var(--ink)", font: "inherit", width: "100%" };
  const groups = [...new Set(diagram.flows.map((f) => f.g))];
  const valid = !!t.trim();
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        Titolo
        <input style={inputStyle} value={t} onChange={(e) => setT(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        Gruppo
        <input style={inputStyle} list="eos-gruppi-flusso-edit" value={g} onChange={(e) => setG(e.target.value)} />
        <datalist id="eos-gruppi-flusso-edit">
          {groups.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        Dove si svolge
        <input style={inputStyle} value={w} onChange={(e) => setW(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        Nota
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 50 }} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={smallBtn}>
          Annulla
        </button>
        <button disabled={!valid} onClick={() => onSave({ t: t.trim(), g: g.trim() || flow.g, w: w.trim(), note: note.trim() || undefined })} style={primaryBtn(valid)}>
          Salva
        </button>
      </div>
    </div>
  );
}

// Lista dei passi di un flusso con riordino, modifica, eliminazione e aggiunta. Ogni operazione è un comando
// a sé (storico granulare), come per i dettagli delle entità. renderStep disegna il contenuto del passo
// (il pulsante che porta il player su quel passo); qui si aggiungono solo i controlli di editing.
export function FlowStepsEditor({
  diagram,
  steps,
  renderStep,
  onAdd,
  onUpdate,
  onDelete,
  onMove,
}: {
  diagram: Diagram;
  steps: FlowStepRaw[];
  renderStep: (index: number) => ReactNode;
  onAdd: (step: FlowStepRaw) => void;
  onUpdate: (index: number, step: FlowStepRaw) => void;
  onDelete: (index: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const ctl: CSSProperties = { ...smallBtn, padding: "2px 6px", fontSize: 12, lineHeight: 1.2 };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
        {steps.map((step, j) => (
          <li key={j}>
            {editingIndex === j ? (
              <FlowStepForm
                diagram={diagram}
                initial={step}
                onCancel={() => setEditingIndex(null)}
                onSubmit={(next) => {
                  onUpdate(j, next);
                  setEditingIndex(null);
                }}
              />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 4, alignItems: "center" }}>
                {renderStep(j)}
                <span style={{ display: "flex", gap: 3 }}>
                  <button disabled={j === 0} onClick={() => onMove(j, j - 1)} aria-label={`Sposta su il passo ${j + 1}`} title="Sposta su" style={{ ...ctl, opacity: j === 0 ? 0.4 : 1 }}>
                    ↑
                  </button>
                  <button disabled={j === steps.length - 1} onClick={() => onMove(j, j + 1)} aria-label={`Sposta giù il passo ${j + 1}`} title="Sposta giù" style={{ ...ctl, opacity: j === steps.length - 1 ? 0.4 : 1 }}>
                    ↓
                  </button>
                  <button onClick={() => setEditingIndex(j)} aria-label={`Modifica il passo ${j + 1}`} title="Modifica passo" style={ctl}>
                    ✎
                  </button>
                  <button onClick={() => onDelete(j)} aria-label={`Elimina il passo ${j + 1}`} title="Elimina passo" style={{ ...ctl, color: "#c0392b", borderColor: "#c0392b" }}>
                    ✕
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>
      {adding ? (
        <FlowStepForm
          diagram={diagram}
          onCancel={() => setAdding(false)}
          onSubmit={(step) => {
            onAdd(step);
            setAdding(false);
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px dashed var(--rule)", borderRadius: 6, padding: "6px 10px", background: "transparent", color: "var(--accent-ink)", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}
        >
          + Aggiungi passo
        </button>
      )}
    </div>
  );
}

function FlowStepForm({ diagram, initial, onCancel, onSubmit }: { diagram: Diagram; initial?: FlowStepRaw; onCancel: () => void; onSubmit: (step: FlowStepRaw) => void }) {
  const [da, setDa] = useState(initial?.[0] ?? diagram.entities[0]?.id ?? "");
  const [a, setA] = useState(initial?.[1] ?? diagram.entities[1]?.id ?? diagram.entities[0]?.id ?? "");
  const [edgeId, setEdgeId] = useState<string>(() => (initial ? (initial[2] ?? "") : (findEdgesBetween(diagram, da, a)[0]?.id ?? "")));
  const [label, setLabel] = useState(initial?.[4] ?? "");
  // Dettaglio facoltativo per ciascuna estremità: gli id nel passo sono quelli dei mods, quindi si assegnano
  // a Da o A in base all'entità che li possiede (se Da e A coincidono, il primo va a Da e il secondo ad A).
  const [daMod, setDaMod] = useState<string>(() => pickInitialModule(diagram, initial?.[0], initial?.[5], 0));
  const [aMod, setAMod] = useState<string>(() => pickInitialModule(diagram, initial?.[1], initial?.[5], initial?.[0] === initial?.[1] ? 1 : 0));
  const inputStyle: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "5px 8px", fontSize: 13, background: "var(--card)", color: "var(--ink)", font: "inherit", width: "100%" };
  const fieldStyle: CSSProperties = { display: "grid", gap: 3, fontSize: 12 };

  const edges = findEdgesBetween(diagram, da, a);
  const edge = edges.find((e) => e.id === edgeId);
  const modsOf = (id: string) => diagram.entities.find((e) => e.id === id)?.mods ?? [];

  // Cambiando entità, il collegamento torna quello esistente tra le due (se c'è) e il dettaglio scelto si azzera
  // se non appartiene più all'entità.
  const changeEnds = (nextDa: string, nextA: string) => {
    setDa(nextDa);
    setA(nextA);
    setEdgeId(findEdgesBetween(diagram, nextDa, nextA)[0]?.id ?? "");
    if (!modsOf(nextDa).some((m) => m.id === daMod)) setDaMod("");
    if (!modsOf(nextA).some((m) => m.id === aMod)) setAMod("");
  };

  const bands = [...new Set(diagram.entities.map((e) => e.band))];
  const entityOptions = bands.map((band) => (
    <optgroup key={band} label={band}>
      {diagram.entities
        .filter((e) => e.band === band)
        .map((e) => (
          <option key={e.id} value={e.id}>
            {e.n}
          </option>
        ))}
    </optgroup>
  ));

  const moduleSelect = (entityId: string, value: string, onChange: (v: string) => void, name: string) => {
    const mods = modsOf(entityId);
    if (mods.length === 0) return null;
    return (
      <label style={fieldStyle}>
        {`Dettaglio di ${name} (facoltativo)`}
        <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Nessuno</option>
          {mods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.t}
            </option>
          ))}
        </select>
      </label>
    );
  };

  const valid = !!label.trim() && !!da && !!a;
  const submit = () => {
    const step: FlowStepRaw = [da, a, edge?.id ?? null, edge ? directionFor(edge, da) : 1, label.trim()];
    const mods = [...new Set([daMod, aMod].filter(Boolean))];
    if (mods.length > 0) step.push(mods);
    onSubmit(step);
  };

  return (
    <div style={{ display: "grid", gap: 6, padding: "8px 10px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--card)" }}>
      <label style={fieldStyle}>
        Da
        <select style={inputStyle} value={da} onChange={(e) => changeEnds(e.target.value, a)}>
          {entityOptions}
        </select>
      </label>
      {moduleSelect(da, daMod, setDaMod, nameOf(diagram, da))}
      <label style={fieldStyle}>
        A
        <select style={inputStyle} value={a} onChange={(e) => changeEnds(da, e.target.value)}>
          {entityOptions}
        </select>
      </label>
      {moduleSelect(a, aMod, setAMod, nameOf(diagram, a))}
      <label style={fieldStyle}>
        Collegamento
        <select style={inputStyle} value={edgeId} onChange={(e) => setEdgeId(e.target.value)}>
          <option value="">Nessuno</option>
          {edges.map((e) => (
            <option key={e.id} value={e.id}>
              {e.l ? `${e.l} (${e.id})` : e.id}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldStyle}>
        Descrizione del passo
        <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ ...smallBtn, padding: "4px 8px", fontSize: 12 }}>
          Annulla
        </button>
        <button disabled={!valid} onClick={submit} style={{ ...primaryBtn(valid), padding: "4px 8px", fontSize: 12 }}>
          Salva
        </button>
      </div>
    </div>
  );
}

// Dai dettagli salvati nel passo ricava quello che appartiene all'entità indicata (il n-esimo se più d'uno).
function pickInitialModule(diagram: Diagram, entityId: string | undefined, saved: string[] | undefined, nth: number): string {
  if (!entityId || !saved) return "";
  const owned = new Set((diagram.entities.find((e) => e.id === entityId)?.mods ?? []).map((m) => m.id));
  return saved.filter((m) => owned.has(m))[nth] ?? "";
}
