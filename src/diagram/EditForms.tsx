import { useState, type CSSProperties, type ReactNode } from "react";
import type { Diagram } from "../types/diagram";
import { EntityPicker, IconPicker, TechnologyPicker, type NewTechnology } from "./EntityFormFields";
import { iconLabel, suggestIcon } from "./iconSuggest";

interface PopoverProps {
  clientX: number;
  clientY: number;
  onClose: () => void;
  children: ReactNode;
}

export function Popover({ clientX, clientY, onClose, children }: PopoverProps) {
  const top = Math.min(clientY, window.innerHeight - 20);
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={onClose} />
      <div
        style={{
          position: "fixed",
          left: Math.min(clientX, window.innerWidth - 300),
          top,
          zIndex: 21,
          background: "var(--card)",
          border: "1px solid var(--accent)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,.2)",
          padding: 14,
          display: "grid",
          gap: 10,
          width: 280,
          maxHeight: `calc(100vh - ${top}px - 20px)`,
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}

interface SidePanelProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

// Pannello laterale per i form più ricchi (entità, contenitore): più spazio di un popover ancorato
// al punto di clic, con un effetto di apparizione da destra.
export function SidePanel({ title, subtitle, onClose, children, footer }: SidePanelProps) {
  return (
    <>
      <div style={panelOverlay} onClick={onClose} />
      <div style={panelShell} onClick={(e) => e.stopPropagation()}>
        <div style={panelHeader}>
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <strong style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontSize: 17 }}>{title}</strong>
            {subtitle && <span style={{ fontSize: 12, color: "var(--accent-ink)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{subtitle}</span>}
          </div>
          <button onClick={onClose} aria-label="Chiudi" title="Chiudi" style={panelCloseBtn}>
            ✕
          </button>
        </div>
        <div style={panelBody}>{children}</div>
        <div style={panelFooter}>{footer}</div>
      </div>
    </>
  );
}

const panelOverlay: CSSProperties = { position: "fixed", inset: 0, zIndex: 20, background: "rgba(0,0,0,.28)", animation: "eosOverlayIn .18s ease-out" };

const panelShell: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  height: "100vh",
  width: "min(420px, 92vw)",
  background: "var(--card)",
  borderLeft: "1px solid var(--rule)",
  boxShadow: "-12px 0 32px rgba(0,0,0,.2)",
  zIndex: 21,
  display: "flex",
  flexDirection: "column",
  animation: "eosPanelIn .25s cubic-bezier(.2,.8,.2,1)",
};

const panelHeader: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--rule)", flex: "none" };

const panelCloseBtn: CSSProperties = { border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 6, flex: "none" };

const panelBody: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", padding: 20, display: "grid", gap: 14, alignContent: "start" };

const panelFooter: CSSProperties = { display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 20px", borderTop: "1px solid var(--rule)", flex: "none" };

const field: CSSProperties = { display: "grid", gap: 4, fontSize: 13 };
const input: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 8px", fontSize: 13.5, background: "var(--paper)", color: "var(--ink)", font: "inherit" };
const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".04em" };

interface EntityFormValues {
  nome: string;
  sottotitolo: string;
  descrizione: string;
  icon: string | undefined;
  technologyIds: string[];
  newTechnologies: NewTechnology[];
}

export function EntityCreateForm({
  diagram,
  banda,
  onCancel,
  onSubmit,
}: {
  diagram: Diagram;
  banda: string;
  onCancel: () => void;
  onSubmit: (values: EntityFormValues) => void;
}) {
  const [nome, setNome] = useState("");
  const [sottotitolo, setSottotitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  // Finché l'utente non sceglie un'icona a mano (anche "nessuna"), l'icona segue la proposta ricavata dal nome.
  const [iconTouched, setIconTouched] = useState(false);
  const [technologyIds, setTechnologyIds] = useState<Set<string>>(new Set());
  const [newTechnologies, setNewTechnologies] = useState<NewTechnology[]>([]);
  const proposed = suggestIcon(nome);

  const changeNome = (value: string) => {
    setNome(value);
    if (!iconTouched) setIcon(suggestIcon(value));
  };

  const toggleTech = (id: string) => {
    setTechnologyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () =>
    onSubmit({
      nome: nome.trim(),
      sottotitolo: sottotitolo.trim(),
      descrizione: descrizione.trim(),
      icon,
      technologyIds: [...technologyIds],
      newTechnologies,
    });

  return (
    <SidePanel
      title="Nuova entità"
      subtitle={`in ${banda}`}
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={btnSecondary}>
            Annulla
          </button>
          <button disabled={!nome.trim()} onClick={submit} style={btnPrimary(!!nome.trim())}>
            Crea
          </button>
        </>
      }
    >
      <label style={field}>
        <span style={label}>Nome *</span>
        <input style={input} value={nome} onChange={(e) => changeNome(e.target.value)} autoFocus />
      </label>
      {proposed && icon === proposed && (
        <span style={{ fontSize: 12, color: "var(--accent-ink)" }}>Icona proposta dal nome: {iconLabel(proposed)}. Puoi sceglierne un'altra qui sotto.</span>
      )}
      <label style={field}>
        <span style={label}>Sottotitolo</span>
        <input style={input} value={sottotitolo} onChange={(e) => setSottotitolo(e.target.value)} />
      </label>
      <label style={field}>
        <span style={label}>Descrizione</span>
        <textarea style={{ ...input, resize: "vertical", minHeight: 50 }} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} />
      </label>
      <IconPicker
        value={icon}
        onChange={(next) => {
          setIconTouched(true);
          setIcon(next);
        }}
      />
      <TechnologyPicker
        technologies={diagram.technologies}
        selected={technologyIds}
        onToggle={toggleTech}
        pending={newTechnologies}
        onAddPending={(t) => setNewTechnologies((prev) => [...prev, t])}
        onRemovePending={(id) => setNewTechnologies((prev) => prev.filter((t) => t.id !== id))}
      />
    </SidePanel>
  );
}

interface BandFormValues {
  etichetta: string;
}

export function BandCreateForm({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (values: BandFormValues) => void }) {
  const [etichetta, setEtichetta] = useState("");

  return (
    <SidePanel
      title="Nuovo contenitore"
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={btnSecondary}>
            Annulla
          </button>
          <button disabled={!etichetta.trim()} onClick={() => onSubmit({ etichetta: etichetta.trim() })} style={btnPrimary(!!etichetta.trim())}>
            Crea
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>Si ridimensiona da solo in base alle entità che conterrà.</p>
      <label style={field}>
        <span style={label}>Etichetta *</span>
        <input style={input} value={etichetta} onChange={(e) => setEtichetta(e.target.value)} autoFocus placeholder="es. TENANT EXTERNAL ID" />
      </label>
    </SidePanel>
  );
}

interface TechnologyFormValues {
  nome: string;
  gruppo: string;
  descrizione: string;
  icon: string | undefined;
  entityIds: string[];
}

export function TechnologyCreateForm({ diagram, onCancel, onSubmit }: { diagram: Diagram; onCancel: () => void; onSubmit: (values: TechnologyFormValues) => void }) {
  const [nome, setNome] = useState("");
  const [gruppo, setGruppo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [entityIds, setEntityIds] = useState<Set<string>>(new Set());
  const gruppiEsistenti = [...new Set(diagram.technologies.map((t) => t.g))];

  const toggleEntity = (id: string) => {
    setEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () =>
    onSubmit({
      nome: nome.trim(),
      gruppo: gruppo.trim(),
      descrizione: descrizione.trim(),
      icon,
      entityIds: [...entityIds],
    });

  return (
    <SidePanel
      title="Nuova tecnologia"
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={btnSecondary}>
            Annulla
          </button>
          <button disabled={!nome.trim()} onClick={submit} style={btnPrimary(!!nome.trim())}>
            Crea
          </button>
        </>
      }
    >
      <label style={field}>
        <span style={label}>Nome *</span>
        <input style={input} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
      </label>
      <label style={field}>
        <span style={label}>Gruppo</span>
        <input style={input} list="eos-gruppi-tecnologia" value={gruppo} onChange={(e) => setGruppo(e.target.value)} placeholder="es. Microsoft Azure" />
        <datalist id="eos-gruppi-tecnologia">
          {gruppiEsistenti.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <label style={field}>
        <span style={label}>Descrizione</span>
        <textarea style={{ ...input, resize: "vertical", minHeight: 50 }} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} />
      </label>
      <IconPicker value={icon} onChange={setIcon} />
      <EntityPicker entities={diagram.entities} selected={entityIds} onToggle={toggleEntity} />
    </SidePanel>
  );
}

interface FlowFormValues {
  titolo: string;
  gruppo: string;
  dove: string;
  nota: string;
}

export function FlowCreateForm({ diagram, onCancel, onSubmit }: { diagram: Diagram; onCancel: () => void; onSubmit: (values: FlowFormValues) => void }) {
  const [titolo, setTitolo] = useState("");
  const [gruppo, setGruppo] = useState("");
  const [dove, setDove] = useState("");
  const [nota, setNota] = useState("");
  const gruppiEsistenti = [...new Set(diagram.flows.map((f) => f.g))];
  const valid = !!titolo.trim();
  const submit = () => onSubmit({ titolo: titolo.trim(), gruppo: gruppo.trim(), dove: dove.trim(), nota: nota.trim() });

  return (
    <SidePanel
      title="Nuovo flusso"
      subtitle="I passi si aggiungono dopo la creazione"
      onClose={onCancel}
      footer={
        <>
          <button onClick={onCancel} style={btnSecondary}>
            Annulla
          </button>
          <button disabled={!valid} onClick={submit} style={btnPrimary(valid)}>
            Crea
          </button>
        </>
      }
    >
      <label style={field}>
        <span style={label}>Titolo *</span>
        <input style={input} value={titolo} onChange={(e) => setTitolo(e.target.value)} autoFocus />
      </label>
      <label style={field}>
        <span style={label}>Gruppo</span>
        <input style={input} list="eos-gruppi-flusso" value={gruppo} onChange={(e) => setGruppo(e.target.value)} placeholder="es. Percorso di un ordine" />
        <datalist id="eos-gruppi-flusso">
          {gruppiEsistenti.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      <label style={field}>
        <span style={label}>Dove si svolge</span>
        <input style={input} value={dove} onChange={(e) => setDove(e.target.value)} placeholder="es. Business Central, publisher" />
      </label>
      <label style={field}>
        <span style={label}>Nota</span>
        <textarea style={{ ...input, resize: "vertical", minHeight: 50 }} value={nota} onChange={(e) => setNota(e.target.value)} />
      </label>
    </SidePanel>
  );
}

interface EdgeFormValues {
  etichetta: string;
  bidirezionale: boolean;
}

export function EdgeCreateForm({
  diagram,
  aId,
  bId,
  clientX,
  clientY,
  onCancel,
  onSubmit,
}: {
  diagram: Diagram;
  aId: string;
  bId: string;
  clientX: number;
  clientY: number;
  onCancel: () => void;
  onSubmit: (values: EdgeFormValues) => void;
}) {
  const [etichetta, setEtichetta] = useState("");
  const [bidirezionale, setBidirezionale] = useState(false);
  const nameOf = (id: string) => diagram.entities.find((e) => e.id === id)?.n ?? id;

  return (
    <Popover clientX={clientX} clientY={clientY} onClose={onCancel}>
      <strong style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontSize: 15 }}>Nuovo collegamento</strong>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>
        {nameOf(aId)} → {nameOf(bId)}
      </div>
      <label style={field}>
        <span style={label}>Etichetta</span>
        <input style={input} value={etichetta} onChange={(e) => setEtichetta(e.target.value)} autoFocus />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input type="checkbox" checked={bidirezionale} onChange={(e) => setBidirezionale(e.target.checked)} />
        Bidirezionale
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={btnSecondary}>
          Annulla
        </button>
        <button onClick={() => onSubmit({ etichetta: etichetta.trim(), bidirezionale })} style={btnPrimary(true)}>
          Crea collegamento
        </button>
      </div>
    </Popover>
  );
}

const btnSecondary: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 12px", fontSize: 13, background: "var(--paper)", cursor: "pointer", color: "var(--ink)" };

function btnPrimary(enabled: boolean): CSSProperties {
  return { border: 0, borderRadius: 6, padding: "6px 12px", fontSize: 13, background: "var(--accent)", color: "#fff", cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.5, fontWeight: 600 };
}
