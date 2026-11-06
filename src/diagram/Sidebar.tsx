import { useState, type CSSProperties } from "react";
import type { Diagram, EntityModule, FlowStepRaw } from "../types/diagram";
import { FlowEditForm, FlowStepsEditor } from "./FlowEditors";
import { suggestIcon } from "./iconSuggest";
import { entityById, flowGroups, parseFlowSteps } from "../data/loadDiagram";
import type { Selection, Tab } from "./types";
import { ChevronDownIcon, CollapseSidebarIcon } from "./icons";
import { IconPicker, TechnologyPicker, type NewTechnology } from "./EntityFormFields";
import { resolveIconUrl } from "./iconCatalog";

interface Props {
  diagram: Diagram;
  tab: Tab;
  setTab: (t: Tab) => void;
  sel: Selection | null;
  hop: number;
  setHop: (h: number) => void;
  playing: boolean;
  select: (kind: Selection["kind"], id: string, forTab?: Tab) => void;
  togglePlay: () => void;
  nextHop: () => void;
  prevHop: () => void;
  onUpdateEntity: (id: string, patch: { n?: string; s?: string[]; desc?: string; icon?: string }, technologyIds?: string[], newTechnologies?: NewTechnology[]) => void;
  onDeleteEntity: (id: string) => void;
  onAddEntityModule: (entityId: string, titolo: string, sottotitolo: string) => void;
  onUpdateEntityModule: (entityId: string, moduleId: string, patch: Partial<Omit<EntityModule, "id">>) => void;
  onDeleteEntityModule: (entityId: string, moduleId: string) => void;
  onEditEntityIcon: (entityId: string) => void;
  onEditTechnologyIcon: (technologyId: string) => void;
  onCollapse: () => void;
  onNewTechnology: () => void;
  onNewFlow: () => void;
  onUpdateFlow: (id: string, patch: { t?: string; g?: string; w?: string; note?: string }) => void;
  onDeleteFlow: (id: string) => void;
  onAddFlowStep: (flowId: string, step: FlowStepRaw) => void;
  onUpdateFlowStep: (flowId: string, index: number, step: FlowStepRaw) => void;
  onDeleteFlowStep: (flowId: string, index: number) => void;
  onMoveFlowStep: (flowId: string, from: number, to: number) => void;
}

function nameOf(diagram: Diagram, id: string) {
  return entityById(diagram, id)?.n ?? id;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string) {
  const groups: { name: string; items: T[] }[] = [];
  items.forEach((item) => {
    const name = keyOf(item);
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  });
  return groups;
}

export function Sidebar({
  diagram,
  tab,
  setTab,
  sel,
  hop,
  setHop,
  playing,
  select,
  togglePlay,
  nextHop,
  prevHop,
  onUpdateEntity,
  onDeleteEntity,
  onAddEntityModule,
  onUpdateEntityModule,
  onDeleteEntityModule,
  onEditEntityIcon,
  onEditTechnologyIcon,
  onCollapse,
  onNewTechnology,
  onNewFlow,
  onUpdateFlow,
  onDeleteFlow,
  onAddFlowStep,
  onUpdateFlowStep,
  onDeleteFlowStep,
  onMoveFlowStep,
}: Props) {
  const tabDefs: [Tab, string, number][] = [
    ["flows", "Flussi", flowGroups(diagram).length],
    ["entities", "Entità", diagram.entities.length],
    ["techs", "Tecnologie", diagram.technologies.length],
  ];

  return (
    <aside style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid var(--rule)", background: "var(--panel)" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 6px 0 16px", borderBottom: "1px solid var(--rule)" }}>
        <button
          title="Comprimi pannello"
          aria-label="Comprimi pannello"
          onClick={onCollapse}
          style={{ border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer", display: "grid", placeItems: "center", padding: 6, flex: "none" }}
        >
          <CollapseSidebarIcon size={16} />
        </button>
        {tabDefs.map(([key, label, count]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                border: 0,
                background: "transparent",
                padding: "14px 4px 11px",
                borderBottom: active ? "3px solid var(--accent)" : "3px solid transparent",
                fontFamily: "'Barlow Semi Condensed',sans-serif",
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: active ? "var(--ink)" : "var(--muted)",
                cursor: "pointer",
                display: "flex",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {label}
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: active ? "var(--accent-ink)" : "var(--muted)", paddingTop: 2 }}>{count}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 12px 24px" }}>
        {tab === "flows" && (
          <FlowsTab
            diagram={diagram}
            sel={sel}
            hop={hop}
            setHop={setHop}
            playing={playing}
            select={select}
            togglePlay={togglePlay}
            nextHop={nextHop}
            prevHop={prevHop}
            onNewFlow={onNewFlow}
            onUpdateFlow={onUpdateFlow}
            onDeleteFlow={onDeleteFlow}
            onAddFlowStep={onAddFlowStep}
            onUpdateFlowStep={onUpdateFlowStep}
            onDeleteFlowStep={onDeleteFlowStep}
            onMoveFlowStep={onMoveFlowStep}
          />
        )}
        {tab === "entities" && (
          <EntitiesTab
            diagram={diagram}
            sel={sel}
            select={select}
            onUpdateEntity={onUpdateEntity}
            onDeleteEntity={onDeleteEntity}
            onAddEntityModule={onAddEntityModule}
            onUpdateEntityModule={onUpdateEntityModule}
            onDeleteEntityModule={onDeleteEntityModule}
            onEditEntityIcon={onEditEntityIcon}
          />
        )}
        {tab === "techs" && (
          <TechsTab diagram={diagram} sel={sel} select={select} onNewTechnology={onNewTechnology} onEditTechnologyIcon={onEditTechnologyIcon} />
        )}
      </div>
    </aside>
  );
}

const groupTitle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  border: 0,
  background: "transparent",
  cursor: "pointer",
  fontFamily: "'Barlow Semi Condensed',sans-serif",
  fontWeight: 600,
  fontSize: 12,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--muted)",
  padding: "14px 6px 6px",
};

function FlowsTab({
  diagram,
  sel,
  hop,
  setHop,
  playing,
  select,
  togglePlay,
  nextHop,
  prevHop,
  onNewFlow,
  onUpdateFlow,
  onDeleteFlow,
  onAddFlowStep,
  onUpdateFlowStep,
  onDeleteFlowStep,
  onMoveFlowStep,
}: Pick<
  Props,
  | "diagram"
  | "sel"
  | "hop"
  | "setHop"
  | "playing"
  | "select"
  | "togglePlay"
  | "nextHop"
  | "prevHop"
  | "onNewFlow"
  | "onUpdateFlow"
  | "onDeleteFlow"
  | "onAddFlowStep"
  | "onUpdateFlowStep"
  | "onDeleteFlowStep"
  | "onMoveFlowStep"
>) {
  const groups = groupBy(diagram.flows, (f) => f.g);
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  return (
    <>
      <button
        onClick={onNewFlow}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", border: "1px dashed var(--rule)", borderRadius: 8, padding: "9px 10px", background: "transparent", color: "var(--accent-ink)", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 4 }}
      >
        + Nuovo flusso
      </button>
      {groups.map((g) => {
        // Un gruppo collassato manualmente resta comunque visibile se contiene il flusso selezionato,
        // altrimenti selezionare un flusso da un'altra vista (es. da un'entità) lo nasconderebbe.
        const hasActiveFlow = g.items.some((f) => sel?.kind === "flow" && sel.id === f.id);
        const collapsed = collapsedGroups.has(g.name) && !hasActiveFlow;
        return (
          <div key={g.name}>
            <button onClick={() => toggleGroup(g.name)} style={groupTitle} aria-expanded={!collapsed}>
              <ChevronDownIcon size={13} style={{ flex: "none", transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform .15s ease" }} />
              <span style={{ flex: 1, textAlign: "left" }}>{g.name}</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: "none", letterSpacing: 0 }}>{g.items.length}</span>
            </button>
            {!collapsed && (
              <div style={{ display: "grid", gap: 4 }}>
                {g.items.map((f) => {
                  const num = String(diagram.flows.indexOf(f) + 1).padStart(2, "0");
                  const active = sel?.kind === "flow" && sel.id === f.id;
                  if (!active) {
                    return (
                      <button
                        key={f.id}
                        onClick={() => select("flow", f.id)}
                        style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 10, alignItems: "start", textAlign: "left", border: "1px solid transparent", borderRadius: 8, padding: "9px 10px", background: "transparent", cursor: "pointer" }}
                      >
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 500, color: "var(--accent-ink)", border: "1.5px solid var(--rule)", borderRadius: 6, height: 26, display: "grid", placeItems: "center" }}>{num}</span>
                        <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{f.t}</span>
                          <span style={{ fontSize: 13, color: "var(--muted)" }}>{f.w}</span>
                        </span>
                      </button>
                    );
                  }
                  const steps = parseFlowSteps(f);
                  // Se il passo indica un dettaglio, lo mostro accanto all'entità a cui appartiene (A › Dettaglio → B).
                  const hopRoute = (from: string, to: string, modules?: string[]) => {
                    const withDetail = (id: string) => {
                      const mod = diagram.entities.find((e) => e.id === id)?.mods?.find((m) => modules?.includes(m.id));
                      return mod ? `${nameOf(diagram, id)} › ${mod.t}` : nameOf(diagram, id);
                    };
                    return `${withDetail(from)} → ${withDetail(to)}`;
                  };
                  return (
                    <div key={f.id} style={{ border: "1px solid var(--accent)", borderRadius: 8, background: "var(--card)", overflow: "hidden" }}>
                      <button onClick={() => select("flow", f.id)} style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 10, alignItems: "start", textAlign: "left", border: 0, padding: "10px 10px 8px", background: "transparent", cursor: "pointer", width: "100%" }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 500, color: "#fff", background: "var(--accent)", borderRadius: 6, height: 26, display: "grid", placeItems: "center" }}>{num}</span>
                        <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{f.t}</span>
                          <span style={{ fontSize: 13, color: "var(--muted)" }}>{f.w}</span>
                        </span>
                      </button>
                      <div style={{ padding: "0 12px 12px", display: "grid", gap: 10 }}>
                        {editingFlowId === f.id ? (
                          <FlowEditForm
                            diagram={diagram}
                            flow={f}
                            onCancel={() => setEditingFlowId(null)}
                            onSave={(patch) => {
                              onUpdateFlow(f.id, patch);
                              setEditingFlowId(null);
                            }}
                          />
                        ) : (
                          <>
                            {f.note && <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{f.note}</p>}
                            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                              <button onClick={() => setEditingFlowId(f.id)} style={{ ...smallBtn, padding: "4px 8px", fontSize: 12 }}>
                                Modifica
                              </button>
                              <button onClick={() => onDeleteFlow(f.id)} style={{ ...smallBtn, padding: "4px 8px", fontSize: 12, color: "#c0392b", borderColor: "#c0392b" }}>
                                Elimina
                              </button>
                            </div>
                          </>
                        )}
                        {steps.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Nessun passo: aggiungine uno qui sotto.</p>}
                        {steps.length > 0 && (
                        <>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button onClick={prevHop} title="Passo precedente" style={navBtn}>
                            ‹
                          </button>
                          <button onClick={togglePlay} style={{ flex: 1, height: 32, border: 0, borderRadius: 6, background: "var(--ink)", color: "var(--paper)", cursor: "pointer", fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 600, fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase" }}>
                            {playing ? "Pausa" : "Riproduci"}
                          </button>
                          <button onClick={nextHop} title="Passo successivo" style={navBtn}>
                            ›
                          </button>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "var(--muted)", minWidth: 38, textAlign: "right" }}>
                            {hop + 1}/{steps.length}
                          </span>
                        </div>
                        <div style={{ height: 3, background: "var(--rule)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", background: "var(--accent)", width: `${Math.round((Math.min(hop + 1, steps.length) / steps.length) * 100)}%`, transition: "width .35s ease" }} />
                        </div>
                        </>
                        )}
                        <FlowStepsEditor
                          key={f.id}
                          diagram={diagram}
                          steps={f.h}
                          renderStep={(j) => {
                            const s = steps[j];
                            const cur = j === hop;
                            return (
                                <button
                                  onClick={() => setHop(j)}
                                  style={{ width: "100%", display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 8, textAlign: "left", border: 0, borderRadius: 6, padding: "7px 8px", background: cur ? "var(--accent-soft)" : "transparent", cursor: "pointer" }}
                                >
                                  <span
                                    style={{
                                      fontFamily: "'JetBrains Mono',monospace",
                                      fontSize: 11,
                                      fontWeight: cur ? 500 : 400,
                                      color: cur ? "#fff" : "var(--muted)",
                                      background: cur ? "var(--accent)" : "transparent",
                                      border: cur ? "none" : "1px solid var(--rule)",
                                      borderRadius: "50%",
                                      width: 20,
                                      height: 20,
                                      display: "grid",
                                      placeItems: "center",
                                    }}
                                  >
                                    {j + 1}
                                  </span>
                                  <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: 13.5, fontWeight: cur ? 600 : 400 }}>{s.label}</span>
                                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: cur ? "var(--accent-ink)" : "var(--muted)" }}>{hopRoute(s.from, s.to, s.modules)}</span>
                                  </span>
                                </button>
                            );
                          }}
                          onAdd={(step) => onAddFlowStep(f.id, step)}
                          onUpdate={(index, step) => onUpdateFlowStep(f.id, index, step)}
                          onDelete={(index) => onDeleteFlowStep(f.id, index)}
                          onMove={(from, to) => onMoveFlowStep(f.id, from, to)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

const navBtn: CSSProperties = { width: 34, height: 32, border: "1px solid var(--rule)", borderRadius: 6, background: "var(--paper)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "var(--ink)" };

function EntitiesTab({
  diagram,
  sel,
  select,
  onUpdateEntity,
  onDeleteEntity,
  onAddEntityModule,
  onUpdateEntityModule,
  onDeleteEntityModule,
  onEditEntityIcon,
}: {
  diagram: Diagram;
  sel: Selection | null;
  select: Props["select"];
  onUpdateEntity: Props["onUpdateEntity"];
  onDeleteEntity: Props["onDeleteEntity"];
  onAddEntityModule: Props["onAddEntityModule"];
  onUpdateEntityModule: Props["onUpdateEntityModule"];
  onDeleteEntityModule: Props["onDeleteEntityModule"];
  onEditEntityIcon: Props["onEditEntityIcon"];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const groups = groupBy(diagram.entities, (e) => e.band);
  return (
    <>
      {groups.map((g) => (
        <div key={g.name}>
          <div style={groupTitle}>{g.name}</div>
          <div style={{ display: "grid", gap: 4 }}>
            {g.items.map((e) => {
              const active = sel?.kind === "entity" && sel.id === e.id;
              const techs = diagram.technologies.filter((t) => t.e.includes(e.id));
              const flows = diagram.flows
                .map((f, i) => ({ f, i }))
                .filter(({ f }) => parseFlowSteps(f).some((s) => s.from === e.id || s.to === e.id || (s.modules ?? []).some((m) => m.startsWith(e.id + "."))));
              const auth = diagram.auth
                .filter((a) => a[2] === e.id || a[3].includes(e.id))
                .map((a) => ({ route: `${a[0]}. ${nameOf(diagram, a[2])} → ${a[3].map((id) => nameOf(diagram, id)).join(", ")}`, kind: diagram.authKinds[a[1]], mech: a[4], cred: a[5] }));

              if (!active) {
                return (
                  <button
                    key={e.id}
                    onClick={() => select("entity", e.id)}
                    style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr)", gap: 10, alignItems: "center", textAlign: "left", border: "1px solid transparent", borderRadius: 8, padding: "8px 10px", background: "transparent", cursor: "pointer" }}
                  >
                    {e.icon ? <img src={resolveIconUrl(e.icon)} alt="" style={{ width: 28, height: 28, display: "block" }} /> : <span style={monoBadge(28)}>{e.mono}</span>}
                    <span style={{ display: "grid", gap: 0, minWidth: 0 }}>
                      <span style={{ fontWeight: 600 }}>{e.n}</span>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>{e.s?.[0]}</span>
                    </span>
                  </button>
                );
              }
              return (
                <div key={e.id} style={{ border: "1px solid var(--accent)", borderRadius: 8, background: "var(--card)", padding: 12, display: "grid", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr)", gap: 12, alignItems: "center" }}>
                    <button onClick={() => onEditEntityIcon(e.id)} title="Cambia icona" aria-label="Cambia icona" style={{ border: 0, padding: 0, background: "transparent", cursor: "pointer", borderRadius: 8 }}>
                      {e.icon ? <img src={resolveIconUrl(e.icon)} alt="" style={{ width: 40, height: 40, display: "block" }} /> : <span style={monoBadge(40)}>{e.mono}</span>}
                    </button>
                    <button onClick={() => select("entity", e.id)} style={{ display: "grid", gap: 0, minWidth: 0, textAlign: "left", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}>
                      <span style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 700, fontSize: 19, lineHeight: 1.15 }}>{e.n}</span>
                      <span style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--accent-ink)", fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 600 }}>{e.band}</span>
                    </button>
                  </div>
                  {editingId === e.id ? (
                    <EntityEditForm
                      diagram={diagram}
                      entity={e}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch, technologyIds, newTechnologies) => {
                        onUpdateEntity(e.id, patch, technologyIds, newTechnologies);
                        setEditingId(null);
                      }}
                    />
                  ) : (
                    <>
                      {e.desc && <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{e.desc}</p>}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditingId(e.id)} style={smallBtn}>
                          Modifica
                        </button>
                        <button
                          onClick={() => {
                            onDeleteEntity(e.id);
                          }}
                          style={{ ...smallBtn, color: "#c0392b", borderColor: "#c0392b" }}
                        >
                          Elimina
                        </button>
                      </div>
                    </>
                  )}
                  <EntityModulesSection
                    entity={e}
                    onAdd={(titolo, sottotitolo) => onAddEntityModule(e.id, titolo, sottotitolo)}
                    onUpdate={(moduleId, patch) => onUpdateEntityModule(e.id, moduleId, patch)}
                    onDelete={(moduleId) => onDeleteEntityModule(e.id, moduleId)}
                  />
                  {techs.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {techs.map((t) => (
                        <button key={t.id} onClick={() => select("tech", t.id, "techs")} style={pill}>
                          {t.n}
                        </button>
                      ))}
                    </div>
                  )}
                  {flows.length > 0 && (
                    <div style={{ display: "grid", gap: 2 }}>
                      {flows.map(({ f, i }) => (
                        <button key={f.id} onClick={() => select("flow", f.id, "flows")} style={{ display: "flex", gap: 8, alignItems: "baseline", textAlign: "left", border: 0, borderRadius: 6, padding: "5px 6px", background: "transparent", cursor: "pointer", fontSize: 13.5, color: "var(--ink)" }}>
                          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: "var(--accent-ink)" }}>{String(i + 1).padStart(2, "0")}</span>
                          {f.t}
                        </button>
                      ))}
                    </div>
                  )}
                  {auth.length > 0 && (
                    <div style={{ display: "grid", gap: 6 }}>
                      {auth.map((a, i) => (
                        <div key={i} style={{ display: "grid", gap: 2, padding: "7px 10px", borderRadius: 6, background: "var(--paper)", border: "1px solid var(--rule)" }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{a.kind}</span>
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>{a.route}</span>
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>{a.mech}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function TechsTab({
  diagram,
  sel,
  select,
  onNewTechnology,
  onEditTechnologyIcon,
}: {
  diagram: Diagram;
  sel: Selection | null;
  select: Props["select"];
  onNewTechnology: () => void;
  onEditTechnologyIcon: Props["onEditTechnologyIcon"];
}) {
  const groups = groupBy(diagram.technologies, (t) => t.g);
  return (
    <>
      <button
        onClick={onNewTechnology}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", border: "1px dashed var(--rule)", borderRadius: 8, padding: "9px 10px", background: "transparent", color: "var(--accent-ink)", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 4 }}
      >
        + Nuova tecnologia
      </button>
      {groups.map((g) => (
        <div key={g.name}>
          <div style={groupTitle}>{g.name}</div>
          <div style={{ display: "grid", gap: 4 }}>
            {g.items.map((t) => {
              const active = sel?.kind === "tech" && sel.id === t.id;
              if (!active) {
                return (
                  <button
                    key={t.id}
                    onClick={() => select("tech", t.id)}
                    style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr)", gap: 10, alignItems: "center", textAlign: "left", border: "1px solid transparent", borderRadius: 8, padding: "8px 10px", background: "transparent", cursor: "pointer" }}
                  >
                    {t.icon ? <img src={resolveIconUrl(t.icon)} alt="" style={{ width: 28, height: 28, display: "block" }} /> : <span style={monoBadge(28)}>{t.mono}</span>}
                    <span style={{ fontWeight: 600 }}>{t.n}</span>
                  </button>
                );
              }
              return (
                <div key={t.id} style={{ border: "1px solid var(--accent)", borderRadius: 8, background: "var(--card)", padding: 12, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "36px minmax(0,1fr)", gap: 12, alignItems: "center" }}>
                    <button onClick={() => onEditTechnologyIcon(t.id)} title="Cambia icona" aria-label="Cambia icona" style={{ border: 0, padding: 0, background: "transparent", cursor: "pointer", borderRadius: 8 }}>
                      {t.icon ? <img src={resolveIconUrl(t.icon)} alt="" style={{ width: 36, height: 36, display: "block" }} /> : <span style={monoBadge(36)}>{t.mono}</span>}
                    </button>
                    <button onClick={() => select("tech", t.id)} style={{ textAlign: "left", border: 0, padding: 0, background: "transparent", cursor: "pointer" }}>
                      <span style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontWeight: 700, fontSize: 17 }}>{t.n}</span>
                    </button>
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>{t.d}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {t.e.map((id) => (
                      <button key={id} onClick={() => select("entity", id, "entities")} style={pill}>
                        {nameOf(diagram, id)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function monoBadge(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: size > 32 ? 8 : 6,
    background: "var(--panel)",
    border: "1px solid var(--rule)",
    display: "grid",
    placeItems: "center",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: size > 32 ? 11 : 9,
    fontWeight: 500,
    color: "var(--ink)",
  };
}

const pill: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 999, padding: "3px 10px", fontSize: 12.5, background: "var(--paper)", cursor: "pointer", color: "var(--ink)" };

const smallBtn: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "5px 10px", fontSize: 12.5, background: "var(--paper)", cursor: "pointer", color: "var(--ink)" };

function EntityEditForm({
  diagram,
  entity,
  onCancel,
  onSave,
}: {
  diagram: Diagram;
  entity: Diagram["entities"][number];
  onCancel: () => void;
  onSave: (patch: { n: string; s: string[]; desc: string; icon?: string }, technologyIds: string[], newTechnologies: NewTechnology[]) => void;
}) {
  const [n, setN] = useState(entity.n);
  const [sub, setSub] = useState(entity.s?.[0] ?? "");
  const [desc, setDesc] = useState(entity.desc ?? "");
  const [icon, setIcon] = useState<string | undefined>(entity.icon);
  // Un'entità senza icona segue la proposta dal nome finché non si sceglie un'icona a mano.
  const [iconTouched, setIconTouched] = useState(!!entity.icon);
  const [technologyIds, setTechnologyIds] = useState<Set<string>>(() => new Set(diagram.technologies.filter((t) => t.e.includes(entity.id)).map((t) => t.id)));
  const [newTechnologies, setNewTechnologies] = useState<NewTechnology[]>([]);
  const inputStyle: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 8px", fontSize: 13.5, background: "var(--paper)", color: "var(--ink)", font: "inherit", width: "100%" };

  const toggleTech = (id: string) => {
    setTechnologyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        Nome
        <input
          style={inputStyle}
          value={n}
          onChange={(e) => {
            setN(e.target.value);
            if (!iconTouched) setIcon(suggestIcon(e.target.value));
          }}
        />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        Sottotitolo
        <input style={inputStyle} value={sub} onChange={(e) => setSub(e.target.value)} />
      </label>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
        Descrizione
        <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 50 }} value={desc} onChange={(e) => setDesc(e.target.value)} />
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
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={smallBtn}>
          Annulla
        </button>
        <button
          onClick={() => onSave({ n: n.trim(), s: sub.trim() ? [sub.trim()] : [], desc: desc.trim(), icon }, [...technologyIds], newTechnologies)}
          style={{ ...smallBtn, background: "var(--accent)", color: "#fff", border: 0, fontWeight: 600 }}
        >
          Salva
        </button>
      </div>
    </div>
  );
}

// Dettagli (moduli interni, livello Component): righe disegnate dentro il rettangolo dell'entità sul
// diagramma. Separata dal form "Modifica" perché ogni aggiunta/modifica/eliminazione è un comando a sé
// (storico granulare, stessa logica che userà la chat) invece di un unico salvataggio cumulativo.
function EntityModulesSection({
  entity,
  onAdd,
  onUpdate,
  onDelete,
}: {
  entity: Diagram["entities"][number];
  onAdd: (titolo: string, sottotitolo: string) => void;
  onUpdate: (moduleId: string, patch: Partial<Omit<EntityModule, "id">>) => void;
  onDelete: (moduleId: string) => void;
}) {
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>Dettagli</span>
      {(entity.mods ?? []).map((m) =>
        editingModuleId === m.id ? (
          <EntityModuleForm
            key={m.id}
            initialTitolo={m.t}
            initialSottotitolo={m.s}
            onCancel={() => setEditingModuleId(null)}
            onSubmit={(titolo, sottotitolo) => {
              onUpdate(m.id, { t: titolo, s: sottotitolo });
              setEditingModuleId(null);
            }}
          />
        ) : (
          <div key={m.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 6, alignItems: "center", padding: "6px 10px", border: "1px solid var(--rule)", borderRadius: 6, background: "var(--paper)" }}>
            <span style={{ display: "grid", minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{m.t}</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{m.s}</span>
            </span>
            <button onClick={() => setEditingModuleId(m.id)} style={{ ...smallBtn, padding: "4px 8px", fontSize: 12 }}>
              Modifica
            </button>
            <button onClick={() => onDelete(m.id)} style={{ ...smallBtn, padding: "4px 8px", fontSize: 12, color: "#c0392b", borderColor: "#c0392b" }}>
              Elimina
            </button>
          </div>
        )
      )}
      {adding ? (
        <EntityModuleForm
          initialTitolo=""
          initialSottotitolo=""
          onCancel={() => setAdding(false)}
          onSubmit={(titolo, sottotitolo) => {
            onAdd(titolo, sottotitolo);
            setAdding(false);
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px dashed var(--rule)", borderRadius: 6, padding: "6px 10px", background: "transparent", color: "var(--accent-ink)", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}
        >
          + Aggiungi dettaglio
        </button>
      )}
    </div>
  );
}

function EntityModuleForm({
  initialTitolo,
  initialSottotitolo,
  onCancel,
  onSubmit,
}: {
  initialTitolo: string;
  initialSottotitolo: string;
  onCancel: () => void;
  onSubmit: (titolo: string, sottotitolo: string) => void;
}) {
  const [titolo, setTitolo] = useState(initialTitolo);
  const [sottotitolo, setSottotitolo] = useState(initialSottotitolo);
  const inputStyle: CSSProperties = { border: "1px solid var(--rule)", borderRadius: 6, padding: "5px 8px", fontSize: 13, background: "var(--card)", color: "var(--ink)", font: "inherit", width: "100%" };
  return (
    <div style={{ display: "grid", gap: 6, padding: "8px 10px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--card)" }}>
      <input style={inputStyle} value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Titolo" autoFocus />
      <input style={inputStyle} value={sottotitolo} onChange={(e) => setSottotitolo(e.target.value)} placeholder="Sottotitolo" />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ ...smallBtn, padding: "4px 8px", fontSize: 12 }}>
          Annulla
        </button>
        <button
          disabled={!titolo.trim()}
          onClick={() => onSubmit(titolo.trim(), sottotitolo.trim())}
          style={{ ...smallBtn, padding: "4px 8px", fontSize: 12, background: "var(--accent)", color: "#fff", border: 0, fontWeight: 600, opacity: titolo.trim() ? 1 : 0.5, cursor: titolo.trim() ? "pointer" : "default" }}
        >
          Salva
        </button>
      </div>
    </div>
  );
}
