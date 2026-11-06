import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import type { Band, Diagram, Edge, Entity, Point } from "../types/diagram";
import type { EditMode, Highlight } from "./types";
import { resolveIconUrl } from "./iconCatalog";
import { fitText, type TextFont } from "./textFit";

// Spazio per i testi dentro il rettangolo dell'entità (240 di larghezza): titolo e sottotitoli partono
// a x+60 e si fermano 12px prima del bordo; i dettagli stanno in un riquadro da 216 con 12px di margine.
const TITLE_MAX_WIDTH = 168;
const MODULE_MAX_WIDTH = 192;

// Testo troncato con "…" che non entra nello spazio; il testo completo resta nel tooltip nativo (solo se troncato).
function Fitted({ text, maxWidth, font }: { text: string; maxWidth: number; font: TextFont }) {
  const fitted = fitText(text, maxWidth, font);
  return (
    <>
      {fitted !== text && <title>{text}</title>}
      {fitted}
    </>
  );
}
import {
  type BandResizeEdges,
  type Rect,
  DEFAULT_ENTITY_HEIGHT,
  ENTITY_WIDTH,
  allEdgeSegments,
  bandAt,
  clientToSvgPoint,
  computeAlignment,
  computeBounds,
  dragEdgeSegment,
  entityAt,
  orthogonalEdgePath,
  pathFromPoints,
  resizeBand,
  sameBandLabel,
  segmentMidpoint,
  segmentOrientation,
  snapBandResize,
} from "./geometry";

interface Props {
  diagram: Diagram;
  highlight: Highlight | null;
  dimOpacity?: number;
  mode: EditMode;
  connectFrom: string | null;
  selectedEdgeId: string | null;
  onEntityClick: (id: string, evt: { clientX: number; clientY: number }) => void;
  onEntityIconClick: (id: string) => void;
  onEntityDragEnd: (id: string, x: number, y: number, candidateBand: string | undefined) => void;
  onEdgeClick: (id: string) => void;
  onEdgeSelect: (id: string | null) => void;
  onEdgePathChange: (id: string, points: Point[]) => void;
  onEdgeReanchor: (id: string, end: "a" | "b", entityId: string, x: number, y: number) => void;
  onEdgeLabelDragEnd: (id: string, lx: number, ly: number) => void;
  onBandClick: (label: string, point: { x: number; y: number }, evt: { clientX: number; clientY: number }) => void;
  onBandResizeEnd: (label: string, edges: BandResizeEdges, dx: number, dy: number) => void;
  onBandDragEnd: (label: string, dx: number, dy: number) => void;
  onBackgroundClick: (point: { x: number; y: number }, evt: { clientX: number; clientY: number }) => void;
}

interface DragState {
  id: string;
  x: number;
  y: number;
}

interface BandResizeState {
  label: string;
  edges: BandResizeEdges;
  dx: number;
  dy: number;
}

interface BandDragState {
  label: string;
  dx: number;
  dy: number;
}

function FlowPath({ edge, dir, keySuffix, strong, isCur }: { edge: Edge; dir: 1 | -1; keySuffix: string; strong: boolean; isCur: boolean }) {
  const d = dir === -1 ? pathFromPoints([...edge.d].reverse()) : pathFromPoints(edge.d);
  return (
    <path
      key={keySuffix}
      d={d}
      fill="none"
      stroke="var(--accent)"
      strokeWidth={isCur ? 5 : strong ? 3.6 : 2.4}
      strokeLinecap="round"
      strokeDasharray="0 12"
      style={{ animation: `${dir < 0 ? "eosFlowRev" : "eosFlow"} ${isCur ? "0.55s" : strong ? "0.9s" : "1.8s"} linear infinite` }}
    />
  );
}

// setPointerCapture lancia se il pointerId non è "attivo" per il browser (es. eventi sintetici nei test,
// o rari casi limite reali): non deve mai interrompere il resto della gestione del drag.
function safeSetPointerCapture(el: Element, pointerId: number) {
  try {
    el.setPointerCapture?.(pointerId);
  } catch {
    // ignorato: senza capture il drag funziona comunque, solo senza il redirect automatico del puntatore
  }
}

const cursorForMode: Record<EditMode, string> = {
  select: "default",
  "add-entity": "crosshair",
  "add-container": "crosshair",
  connect: "crosshair",
  delete: "not-allowed",
};

export function DiagramCanvas({
  diagram,
  highlight,
  dimOpacity = 0.22,
  mode,
  connectFrom,
  selectedEdgeId,
  onEntityClick,
  onEntityIconClick,
  onEntityDragEnd,
  onEdgeClick,
  onEdgeSelect,
  onEdgePathChange,
  onEdgeReanchor,
  onEdgeLabelDragEnd,
  onBandClick,
  onBandResizeEnd,
  onBandDragEnd,
  onBackgroundClick,
}: Props) {
  const dim = !!highlight;
  const hl = highlight;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [bandResize, setBandResize] = useState<BandResizeState | null>(null);
  const [bandDrag, setBandDrag] = useState<BandDragState | null>(null);
  const [edgePreview, setEdgePreview] = useState<{ id: string; points: Point[] } | null>(null);
  const [endpointDrag, setEndpointDrag] = useState<{ edgeId: string; end: "a" | "b"; x: number; y: number } | null>(null);
  const [labelDrag, setLabelDrag] = useState<{ id: string; lx: number; ly: number } | null>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  const toSvgPoint = (clientX: number, clientY: number) => (svgRef.current ? clientToSvgPoint(svgRef.current, clientX, clientY) : { x: clientX, y: clientY });

  // Scarto da applicare alla posizione trascinata di un'entità per agganciarsi (snap) al bordo/centro
  // del contenitore o dell'entità allineabile più vicina; restituisce anche le linee guida da mostrare.
  const snapEntityPos = (id: string, rawX: number, rawY: number, h: number) => {
    const moving: Rect = { x: rawX, y: rawY, w: ENTITY_WIDTH, h };
    const others: Rect[] = [
      ...diagram.bands.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      ...diagram.entities.filter((e) => e.id !== id).map((e) => ({ x: e.x, y: e.y, w: ENTITY_WIDTH, h: e.h ?? DEFAULT_ENTITY_HEIGHT })),
    ];
    const al = computeAlignment(moving, others);
    return { x: Math.round(rawX + al.dx), y: Math.round(rawY + al.dy), vLines: al.vLines, hLines: al.hLines };
  };

  // Stesso principio per lo spostamento di un intero contenitore: si allinea agli altri contenitori e
  // alle entità che non gli appartengono (quelle al suo interno si muovono con lui, non sono un riferimento).
  const snapBandPos = (b0: Band, rawDx: number, rawDy: number) => {
    const moving: Rect = { x: b0.x + rawDx, y: b0.y + rawDy, w: b0.w, h: b0.h };
    const movedIds = new Set(diagram.entities.filter((e) => sameBandLabel(e.band, b0.l)).map((e) => e.id));
    const others: Rect[] = [
      ...diagram.bands.filter((b) => b.l !== b0.l).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      ...diagram.entities.filter((e) => !movedIds.has(e.id)).map((e) => ({ x: e.x, y: e.y, w: ENTITY_WIDTH, h: e.h ?? DEFAULT_ENTITY_HEIGHT })),
    ];
    const al = computeAlignment(moving, others);
    return { dx: rawDx + al.dx, dy: rawDy + al.dy, vLines: al.vLines, hLines: al.hLines };
  };

  // Idem per il ridimensionamento di un bordo del contenitore: si allinea agli altri contenitori e a
  // tutte le entità (anche le proprie, utile per far combaciare il bordo con una card al suo interno).
  const snapBandResizePos = (b0: Band, edges: BandResizeEdges, dx: number, dy: number) => {
    const others: Rect[] = [
      ...diagram.bands.filter((b) => b.l !== b0.l).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      ...diagram.entities.map((e) => ({ x: e.x, y: e.y, w: ENTITY_WIDTH, h: e.h ?? DEFAULT_ENTITY_HEIGHT })),
    ];
    const s = snapBandResize(b0, edges, dx, dy, others);
    return { dx: s.dx, dy: s.dy, vLines: s.vLines, hLines: s.hLines };
  };

  const liveBand = (b: Band): Band => {
    let band = bandResize && bandResize.label === b.l ? resizeBand(b, bandResize.edges, bandResize.dx, bandResize.dy) : b;
    if (bandDrag && bandDrag.label === b.l) band = { ...band, x: band.x + bandDrag.dx, y: band.y + bandDrag.dy };
    return band;
  };

  // Durante un ridimensionamento o spostamento manuale del contenitore, il viewBox deve seguire subito
  // il bordo trascinato: altrimenti trascinare oltre i confini correnti taglierebbe via il contenuto
  // prima ancora del rilascio.
  const { minX, minY, width, height } = computeBounds(bandResize || bandDrag ? { ...diagram, bands: diagram.bands.map(liveBand), entities: diagram.entities.map((e) => liveEntityOf(e)) } : diagram);

  const draggedEntity = dragState ? diagram.entities.find((e) => e.id === dragState.id) : undefined;
  const candidateBand = dragState && draggedEntity ? bandAt(diagram, dragState.x + ENTITY_WIDTH / 2, dragState.y + (draggedEntity.h ?? DEFAULT_ENTITY_HEIGHT) / 2) : undefined;

  function liveEntityOf(e: Entity): Entity {
    if (dragState && dragState.id === e.id) return { ...e, x: dragState.x, y: dragState.y };
    if (bandDrag && sameBandLabel(e.band, bandDrag.label)) return { ...e, x: e.x + bandDrag.dx, y: e.y + bandDrag.dy };
    return e;
  }
  const liveEntity = liveEntityOf;
  const movingEntityIds = bandDrag ? new Set(diagram.entities.filter((e) => sameBandLabel(e.band, bandDrag.label)).map((e) => e.id)) : null;
  const candidateEntity = endpointDrag ? entityAt(diagram, endpointDrag.x, endpointDrag.y) : undefined;

  // Le bande hanno un riempimento e intercetterebbero il click prima che raggiunga l'svg:
  // i nodi/le maniglie di eliminazione/le bande in modalità "nuova entità" fermano la propagazione,
  // tutto il resto (sfondo vuoto, collegamenti) arriva qui.
  const handleBackgroundClick = (evt: MouseEvent<SVGSVGElement>) => {
    if (mode === "select") onEdgeSelect(null);
    if (mode !== "add-container" || !svgRef.current) return;
    const point = clientToSvgPoint(svgRef.current, evt.clientX, evt.clientY);
    onBackgroundClick(point, { clientX: evt.clientX, clientY: evt.clientY });
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Schema architetturale"
      style={{ display: "block", cursor: cursorForMode[mode] }}
      onClick={handleBackgroundClick}
    >
      <defs>
        <marker id="mk-base" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--edge)" />
        </marker>
        <marker id="mk-acc" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)" />
        </marker>
      </defs>

      {diagram.bands.map((b0, i) => {
        const b = liveBand(b0);
        const selectable = mode === "add-entity";
        const isDropTarget = !!candidateBand && candidateBand.l === b0.l;
        const highlighted = selectable || isDropTarget;
        return (
          <g key={`b${i}`}>
            <g
              style={selectable ? { cursor: "pointer" } : undefined}
              onClick={
                selectable
                  ? (evt) => {
                      evt.stopPropagation();
                      if (!svgRef.current) return;
                      const point = clientToSvgPoint(svgRef.current, evt.clientX, evt.clientY);
                      onBandClick(b0.l, point, { clientX: evt.clientX, clientY: evt.clientY });
                    }
                  : undefined
              }
            >
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={6}
                fill={highlighted ? "var(--accent-soft)" : "var(--band)"}
                stroke={highlighted ? "var(--accent)" : "var(--band-line)"}
                strokeWidth={highlighted ? 2 : 1}
                strokeDasharray="5 4"
                style={{ transition: bandResize?.label === b0.l || bandDrag?.label === b0.l ? undefined : "fill .15s, stroke .15s" }}
              />
              {mode === "select" && (
                <BandDragArea
                  band={b}
                  toSvgPoint={toSvgPoint}
                  onDragMove={(dx, dy) => {
                    const snapped = snapBandPos(b0, dx, dy);
                    setBandDrag({ label: b0.l, dx: snapped.dx, dy: snapped.dy });
                    setGuides({ v: snapped.vLines, h: snapped.hLines });
                  }}
                  onDragEnd={(dx, dy) => {
                    setBandDrag(null);
                    setGuides({ v: [], h: [] });
                    const snapped = snapBandPos(b0, dx, dy);
                    if (snapped.dx !== 0 || snapped.dy !== 0) onBandDragEnd(b0.l, snapped.dx, snapped.dy);
                  }}
                />
              )}
              <text x={b.x + 14} y={b.y + 20} fill={highlighted ? "var(--accent-ink)" : "var(--muted)"} style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: ".06em", pointerEvents: "none" }}>
                {b0.l}
              </text>
            </g>
            {mode === "select" && (
              <BandResizeHandles
                band={b}
                toSvgPoint={toSvgPoint}
                onResizeMove={(edges, dx, dy) => {
                  const snapped = snapBandResizePos(b0, edges, dx, dy);
                  setBandResize({ label: b0.l, edges, dx: snapped.dx, dy: snapped.dy });
                  setGuides({ v: snapped.vLines, h: snapped.hLines });
                }}
                onResizeEnd={(edges, dx, dy) => {
                  setBandResize(null);
                  setGuides({ v: [], h: [] });
                  const snapped = snapBandResizePos(b0, edges, dx, dy);
                  if (snapped.dx !== 0 || snapped.dy !== 0) onBandResizeEnd(b0.l, edges, snapped.dx, snapped.dy);
                }}
              />
            )}
          </g>
        );
      })}

      {diagram.edges.map((e) => {
        const invActual = !dim || hl!.edges.has(e.id);
        const strong = dim && invActual;
        const isCur = !!(hl?.cur && hl.cur.edge === e.id);
        const dir = strong ? hl!.edges.get(e.id) : 1;
        const dragging = !!(dragState && (e.a === dragState.id || e.b === dragState.id)) || !!(movingEntityIds && (movingEntityIds.has(e.a) || movingEntityIds.has(e.b)));
        const a = diagram.entities.find((x) => x.id === e.a);
        const b = diagram.entities.find((x) => x.id === e.b);
        let points = dragging && a && b ? orthogonalEdgePath(liveEntity(a), liveEntity(b)) : edgePreview && edgePreview.id === e.id ? edgePreview.points : e.d;
        const reanchoring = endpointDrag && endpointDrag.edgeId === e.id;
        if (reanchoring) {
          const pts = points.map(([x, y]) => [x, y] as Point);
          if (endpointDrag.end === "a") pts[0] = [endpointDrag.x, endpointDrag.y];
          else pts[pts.length - 1] = [endpointDrag.x, endpointDrag.y];
          points = pts;
        }
        const flows: ReactNode[] = [];
        if (isCur) {
          flows.push(<path key="g" d={pathFromPoints(points)} fill="none" stroke="var(--accent)" strokeWidth={14} strokeLinecap="round" style={{ animation: "eosPulse 1.4s ease-in-out infinite" }} />);
        }
        if (invActual && !dragging) {
          if (isCur && hl?.cur) {
            flows.push(<FlowPath key="f" edge={{ ...e, d: points }} dir={hl.cur.dir} keySuffix="f" strong isCur />);
          } else if (dir === 2) {
            flows.push(<FlowPath key="f1" edge={{ ...e, d: points }} dir={1} keySuffix="f1" strong={strong} isCur={false} />);
            flows.push(<FlowPath key="f2" edge={{ ...e, d: points }} dir={-1} keySuffix="f2" strong={strong} isCur={false} />);
          } else {
            flows.push(<FlowPath key="f" edge={{ ...e, d: points }} dir={(dir as 1 | -1) ?? 1} keySuffix="f" strong={strong} isCur={false} />);
          }
        }
        const selected = selectedEdgeId === e.id;
        return (
          <g key={e.id} style={{ opacity: invActual ? 1 : dimOpacity * 0.7, transition: dragging ? undefined : "opacity .35s" }}>
            <path
              d={pathFromPoints(points)}
              fill="none"
              stroke={selected ? "var(--accent)" : dragging ? "var(--accent)" : strong ? "var(--accent)" : "var(--edge)"}
              strokeOpacity={strong && !dragging ? 0.45 : 1}
              strokeDasharray={dragging ? "4 4" : undefined}
              strokeWidth={selected ? 2.4 : strong ? 2 : 1.5}
              markerEnd={selected || strong || dragging ? "url(#mk-acc)" : "url(#mk-base)"}
              markerStart={e.bi ? (selected || strong || dragging ? "url(#mk-acc)" : "url(#mk-base)") : undefined}
            />
            {(mode === "delete" || mode === "select") && (
              <path
                d={pathFromPoints(points)}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ cursor: mode === "delete" ? "not-allowed" : "pointer" }}
                onClick={(evt) => {
                  evt.stopPropagation();
                  if (mode === "delete") onEdgeClick(e.id);
                  else onEdgeSelect(selected ? null : e.id);
                }}
              />
            )}
            {mode === "select" && selected && !dragging && !reanchoring && (
              <EdgeSegmentHandles
                points={points}
                entityA={a}
                entityB={b}
                toSvgPoint={toSvgPoint}
                onPreview={(next) => setEdgePreview(next ? { id: e.id, points: next } : null)}
                onChange={(next) => {
                  setEdgePreview(null);
                  onEdgePathChange(e.id, next);
                }}
              />
            )}
            {mode === "select" && selected && !dragging && (
              <EdgeEndpointHandles
                points={points}
                toSvgPoint={toSvgPoint}
                onDragMove={(end, x, y) => setEndpointDrag({ edgeId: e.id, end, x, y })}
                onDragEnd={(end, x, y) => {
                  setEndpointDrag(null);
                  const target = entityAt(diagram, x, y);
                  const otherId = end === "a" ? e.b : e.a;
                  if (target && target.id !== otherId) onEdgeReanchor(e.id, end, target.id, x, y);
                }}
              />
            )}
            {flows}
          </g>
        );
      })}

      {diagram.edges
        .filter((e) => e.l && !(dragState && (e.a === dragState.id || e.b === dragState.id)))
        .map((e) => {
          const inv = !dim || hl!.edges.has(e.id);
          const live = labelDrag && labelDrag.id === e.id;
          const lx = live ? labelDrag!.lx : (e.lx ?? 0);
          const ly = live ? labelDrag!.ly : (e.ly ?? 0);
          return (
            <g key={`l${e.id}`} style={{ opacity: inv ? 1 : dimOpacity, transition: "opacity .35s" }}>
              <EdgeLabel
                mode={mode}
                x={lx}
                y={ly}
                text={e.l!}
                highlighted={dim && inv}
                toSvgPoint={toSvgPoint}
                onDragMove={(nx, ny) => setLabelDrag({ id: e.id, lx: nx, ly: ny })}
                onDragEnd={(nx, ny) => {
                  setLabelDrag(null);
                  onEdgeLabelDragEnd(e.id, nx, ny);
                }}
              />
            </g>
          );
        })}

      {diagram.entities.map((n) => (
        <EntityNode
          key={n.id}
          entity={liveEntity(n)}
          highlight={hl}
          dim={dim}
          dimOpacity={dimOpacity}
          mode={mode}
          isConnectSource={connectFrom === n.id}
          isDragging={dragState?.id === n.id}
          toSvgPoint={toSvgPoint}
          onClick={(evt) => {
            evt.stopPropagation();
            onEntityClick(n.id, { clientX: evt.clientX, clientY: evt.clientY });
          }}
          onIconClick={() => onEntityIconClick(n.id)}
          onDragMove={(x, y) => {
            const snapped = snapEntityPos(n.id, x, y, n.h ?? DEFAULT_ENTITY_HEIGHT);
            setDragState({ id: n.id, x: snapped.x, y: snapped.y });
            setGuides({ v: snapped.vLines, h: snapped.hLines });
          }}
          onDragEnd={(x, y) => {
            setDragState(null);
            setGuides({ v: [], h: [] });
            const snapped = snapEntityPos(n.id, x, y, n.h ?? DEFAULT_ENTITY_HEIGHT);
            const cb = bandAt(diagram, snapped.x + ENTITY_WIDTH / 2, snapped.y + (n.h ?? DEFAULT_ENTITY_HEIGHT) / 2);
            onEntityDragEnd(n.id, snapped.x, snapped.y, cb?.l);
          }}
        />
      ))}

      {candidateEntity && (
        <rect
          x={candidateEntity.x - 4}
          y={candidateEntity.y - 4}
          width={ENTITY_WIDTH + 8}
          height={(candidateEntity.h ?? DEFAULT_ENTITY_HEIGHT) + 8}
          rx={10}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={3}
          style={{ pointerEvents: "none" }}
        />
      )}

      {(guides.v.length > 0 || guides.h.length > 0) && (
        <g style={{ pointerEvents: "none" }}>
          {guides.v.map((x) => (
            <line key={`gv${x}`} x1={x} x2={x} y1={minY} y2={minY + height} stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 4" />
          ))}
          {guides.h.map((y) => (
            <line key={`gh${y}`} y1={y} y2={y} x1={minX} x2={minX + width} stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 4" />
          ))}
        </g>
      )}
    </svg>
  );
}

interface ResizeTrack {
  pointerId: number;
  startSvgX: number;
  startSvgY: number;
  edges: BandResizeEdges;
}

interface HandleSpec {
  key: string;
  cursor: string;
  x: number;
  y: number;
  w: number;
  h: number;
  edges: BandResizeEdges;
}

function handlesFor(b: Band): HandleSpec[] {
  const T = 10;
  const C = 16;
  return [
    { key: "n", cursor: "ns-resize", x: b.x + C, y: b.y - T / 2, w: Math.max(0, b.w - 2 * C), h: T, edges: { top: true } },
    { key: "s", cursor: "ns-resize", x: b.x + C, y: b.y + b.h - T / 2, w: Math.max(0, b.w - 2 * C), h: T, edges: { bottom: true } },
    { key: "w", cursor: "ew-resize", x: b.x - T / 2, y: b.y + C, w: T, h: Math.max(0, b.h - 2 * C), edges: { left: true } },
    { key: "e", cursor: "ew-resize", x: b.x + b.w - T / 2, y: b.y + C, w: T, h: Math.max(0, b.h - 2 * C), edges: { right: true } },
    { key: "nw", cursor: "nwse-resize", x: b.x - C / 2, y: b.y - C / 2, w: C, h: C, edges: { top: true, left: true } },
    { key: "ne", cursor: "nesw-resize", x: b.x + b.w - C / 2, y: b.y - C / 2, w: C, h: C, edges: { top: true, right: true } },
    { key: "sw", cursor: "nesw-resize", x: b.x - C / 2, y: b.y + b.h - C / 2, w: C, h: C, edges: { bottom: true, left: true } },
    { key: "se", cursor: "nwse-resize", x: b.x + b.w - C / 2, y: b.y + b.h - C / 2, w: C, h: C, edges: { bottom: true, right: true } },
  ];
}

function BandResizeHandles({
  band,
  toSvgPoint,
  onResizeMove,
  onResizeEnd,
}: {
  band: Band;
  toSvgPoint: (clientX: number, clientY: number) => { x: number; y: number };
  onResizeMove: (edges: BandResizeEdges, dx: number, dy: number) => void;
  onResizeEnd: (edges: BandResizeEdges, dx: number, dy: number) => void;
}) {
  const track = useRef<ResizeTrack | null>(null);

  const handlePointerDown = (evt: PointerEvent<SVGRectElement>, edges: BandResizeEdges) => {
    evt.stopPropagation();
    safeSetPointerCapture(evt.currentTarget, evt.pointerId);
    const p = toSvgPoint(evt.clientX, evt.clientY);
    track.current = { pointerId: evt.pointerId, startSvgX: p.x, startSvgY: p.y, edges };
  };

  const handlePointerMove = (evt: PointerEvent<SVGRectElement>) => {
    const t = track.current;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onResizeMove(t.edges, p.x - t.startSvgX, p.y - t.startSvgY);
  };

  const handlePointerUp = (evt: PointerEvent<SVGRectElement>) => {
    const t = track.current;
    track.current = null;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onResizeEnd(t.edges, p.x - t.startSvgX, p.y - t.startSvgY);
  };

  return (
    <>
      {handlesFor(band).map((h) => (
        <rect
          key={h.key}
          x={h.x}
          y={h.y}
          width={h.w}
          height={h.h}
          fill="transparent"
          data-no-pan="true"
          style={{ cursor: h.cursor }}
          onPointerDown={(evt) => handlePointerDown(evt, h.edges)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      ))}
    </>
  );
}

interface BandDragTrack {
  pointerId: number;
  startSvgX: number;
  startSvgY: number;
  moved: boolean;
}

// Area trascinabile dell'intero contenitore: sotto il testo/le maniglie di resize (z-order), copre
// il rettangolo della banda così un trascinamento sullo sfondo del contenitore lo sposta in blocco
// insieme alle entità che contiene (vedi moveBand).
function BandDragArea({
  band,
  toSvgPoint,
  onDragMove,
  onDragEnd,
}: {
  band: Band;
  toSvgPoint: (clientX: number, clientY: number) => { x: number; y: number };
  onDragMove: (dx: number, dy: number) => void;
  onDragEnd: (dx: number, dy: number) => void;
}) {
  const track = useRef<BandDragTrack | null>(null);

  const handlePointerDown = (evt: PointerEvent<SVGRectElement>) => {
    evt.stopPropagation();
    safeSetPointerCapture(evt.currentTarget, evt.pointerId);
    const p = toSvgPoint(evt.clientX, evt.clientY);
    track.current = { pointerId: evt.pointerId, startSvgX: p.x, startSvgY: p.y, moved: false };
  };

  const handlePointerMove = (evt: PointerEvent<SVGRectElement>) => {
    const t = track.current;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    const dx = p.x - t.startSvgX;
    const dy = p.y - t.startSvgY;
    if (!t.moved && Math.hypot(dx, dy) < 3) return;
    t.moved = true;
    onDragMove(dx, dy);
  };

  const handlePointerUp = (evt: PointerEvent<SVGRectElement>) => {
    const t = track.current;
    track.current = null;
    if (!t || t.pointerId !== evt.pointerId) return;
    if (!t.moved) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onDragEnd(p.x - t.startSvgX, p.y - t.startSvgY);
  };

  return (
    <rect
      x={band.x}
      y={band.y}
      width={band.w}
      height={band.h}
      fill="transparent"
      data-no-pan="true"
      style={{ cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}

interface EdgeSegmentTrack {
  pointerId: number;
  startSvgX: number;
  startSvgY: number;
  points: Point[];
  segIndex: number;
}

// Maniglie per trascinare i segmenti di un collegamento mantenendo gli angoli retti (vedi
// dragEdgeSegment): un piccolo cerchio al centro di ogni segmento, incluse le due rette che toccano le
// entità (il loro punto d'aggancio scorre lungo il bordo invece di staccarsi).
function EdgeSegmentHandles({
  points,
  entityA,
  entityB,
  toSvgPoint,
  onPreview,
  onChange,
}: {
  points: Point[];
  entityA?: Entity;
  entityB?: Entity;
  toSvgPoint: (clientX: number, clientY: number) => { x: number; y: number };
  onPreview: (points: Point[] | null) => void;
  onChange: (points: Point[]) => void;
}) {
  const track = useRef<EdgeSegmentTrack | null>(null);

  const segments = allEdgeSegments(points);

  const handlePointerDown = (evt: PointerEvent<SVGCircleElement>, segIndex: number) => {
    evt.stopPropagation();
    safeSetPointerCapture(evt.currentTarget, evt.pointerId);
    const p = toSvgPoint(evt.clientX, evt.clientY);
    track.current = { pointerId: evt.pointerId, startSvgX: p.x, startSvgY: p.y, points, segIndex };
  };

  const handlePointerMove = (evt: PointerEvent<SVGCircleElement>) => {
    const t = track.current;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onPreview(dragEdgeSegment(t.points, t.segIndex, p.x - t.startSvgX, p.y - t.startSvgY, entityA, entityB));
  };

  const handlePointerUp = (evt: PointerEvent<SVGCircleElement>) => {
    const t = track.current;
    track.current = null;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onChange(dragEdgeSegment(t.points, t.segIndex, p.x - t.startSvgX, p.y - t.startSvgY, entityA, entityB));
  };

  return (
    <>
      {segments.map((i) => {
        const [mx, my] = segmentMidpoint(points, i);
        const cursor = segmentOrientation(points, i) === "h" ? "ns-resize" : "ew-resize";
        return (
          <circle
            key={i}
            cx={mx}
            cy={my}
            r={6}
            fill="var(--card)"
            stroke="var(--accent)"
            strokeWidth={2}
            data-no-pan="true"
            style={{ cursor }}
            onPointerDown={(evt) => handlePointerDown(evt, i)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        );
      })}
    </>
  );
}

interface EdgeEndpointTrack {
  pointerId: number;
  end: "a" | "b";
  startX: number;
  startY: number;
  moved: boolean;
}

// Maniglie piene alle due estremità del collegamento: trascinandole su un'altra entità se ne cambia
// l'ancoraggio (vedi reanchorEdge); rilasciate nel vuoto non succede nulla.
function EdgeEndpointHandles({
  points,
  toSvgPoint,
  onDragMove,
  onDragEnd,
}: {
  points: Point[];
  toSvgPoint: (clientX: number, clientY: number) => { x: number; y: number };
  onDragMove: (end: "a" | "b", x: number, y: number) => void;
  onDragEnd: (end: "a" | "b", x: number, y: number) => void;
}) {
  const track = useRef<EdgeEndpointTrack | null>(null);

  const handlePointerDown = (evt: PointerEvent<SVGCircleElement>, end: "a" | "b") => {
    evt.stopPropagation();
    safeSetPointerCapture(evt.currentTarget, evt.pointerId);
    const p = toSvgPoint(evt.clientX, evt.clientY);
    track.current = { pointerId: evt.pointerId, end, startX: p.x, startY: p.y, moved: false };
  };

  const handlePointerMove = (evt: PointerEvent<SVGCircleElement>) => {
    const t = track.current;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    if (!t.moved && Math.hypot(p.x - t.startX, p.y - t.startY) < 3) return;
    t.moved = true;
    onDragMove(t.end, p.x, p.y);
  };

  const handlePointerUp = (evt: PointerEvent<SVGCircleElement>) => {
    const t = track.current;
    track.current = null;
    if (!t || t.pointerId !== evt.pointerId || !t.moved) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onDragEnd(t.end, p.x, p.y);
  };

  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];

  return (
    <>
      <circle
        cx={sx}
        cy={sy}
        r={5}
        fill="var(--accent)"
        stroke="var(--card)"
        strokeWidth={1.5}
        data-no-pan="true"
        style={{ cursor: "crosshair" }}
        onPointerDown={(evt) => handlePointerDown(evt, "a")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <circle
        cx={ex}
        cy={ey}
        r={5}
        fill="var(--accent)"
        stroke="var(--card)"
        strokeWidth={1.5}
        data-no-pan="true"
        style={{ cursor: "crosshair" }}
        onPointerDown={(evt) => handlePointerDown(evt, "b")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </>
  );
}

interface LabelDragTrack {
  pointerId: number;
  startSvgX: number;
  startSvgY: number;
  startX: number;
  startY: number;
  moved: boolean;
}

// Etichetta di un collegamento, trascinabile liberamente in modalità "Seleziona".
function EdgeLabel({
  mode,
  x,
  y,
  text,
  highlighted,
  toSvgPoint,
  onDragMove,
  onDragEnd,
}: {
  mode: EditMode;
  x: number;
  y: number;
  text: string;
  highlighted: boolean;
  toSvgPoint: (clientX: number, clientY: number) => { x: number; y: number };
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const track = useRef<LabelDragTrack | null>(null);
  const w = text.length * 6.4 + 12;

  const handlePointerDown = (evt: PointerEvent<SVGRectElement>) => {
    if (mode !== "select") return;
    evt.stopPropagation();
    safeSetPointerCapture(evt.currentTarget, evt.pointerId);
    const p = toSvgPoint(evt.clientX, evt.clientY);
    track.current = { pointerId: evt.pointerId, startSvgX: p.x, startSvgY: p.y, startX: x, startY: y, moved: false };
  };

  const handlePointerMove = (evt: PointerEvent<SVGRectElement>) => {
    const t = track.current;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    const dx = p.x - t.startSvgX;
    const dy = p.y - t.startSvgY;
    if (!t.moved && Math.hypot(dx, dy) < 3) return;
    t.moved = true;
    onDragMove(Math.round(t.startX + dx), Math.round(t.startY + dy));
  };

  const handlePointerUp = (evt: PointerEvent<SVGRectElement>) => {
    const t = track.current;
    track.current = null;
    if (!t || t.pointerId !== evt.pointerId || !t.moved) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onDragEnd(Math.round(t.startX + (p.x - t.startSvgX)), Math.round(t.startY + (p.y - t.startSvgY)));
  };

  return (
    <>
      <rect
        x={x - w / 2}
        y={y - 13}
        width={w}
        height={18}
        rx={3}
        fill="var(--paper)"
        stroke={highlighted ? "var(--accent)" : "none"}
        strokeWidth={1}
        data-no-pan={mode === "select" ? "true" : undefined}
        style={{ cursor: mode === "select" ? "grab" : "default" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <text x={x} y={y} textAnchor="middle" fill={highlighted ? "var(--ink)" : "var(--muted)"} style={{ fontSize: 11.5, fontWeight: highlighted ? 600 : 400, pointerEvents: "none" }}>
        {text}
      </text>
    </>
  );
}

interface DragTrack {
  pointerId: number;
  startSvgX: number;
  startSvgY: number;
  startEntityX: number;
  startEntityY: number;
  moved: boolean;
}

function EntityNode({
  entity: n,
  highlight: hl,
  dim,
  dimOpacity,
  mode,
  isConnectSource,
  isDragging,
  toSvgPoint,
  onClick,
  onIconClick,
  onDragMove,
  onDragEnd,
}: {
  entity: Entity;
  highlight: Highlight | null;
  dim: boolean;
  dimOpacity: number;
  mode: EditMode;
  isConnectSource: boolean;
  isDragging: boolean;
  toSvgPoint: (clientX: number, clientY: number) => { x: number; y: number };
  onClick: (evt: MouseEvent<SVGGElement>) => void;
  onIconClick: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  const H = n.h ?? DEFAULT_ENTITY_HEIGHT;
  const W = ENTITY_WIDTH;
  const inv = !dim || hl!.nodes.has(n.id);
  const hot = !!(hl && ((hl.cur && (hl.cur.from === n.id || hl.cur.to === n.id)) || hl.focus === n.id)) || isConnectSource;
  const dragTrack = useRef<DragTrack | null>(null);

  const handlePointerDown = (evt: PointerEvent<SVGGElement>) => {
    if (mode !== "select") return;
    evt.stopPropagation();
    safeSetPointerCapture(evt.currentTarget, evt.pointerId);
    const p = toSvgPoint(evt.clientX, evt.clientY);
    dragTrack.current = { pointerId: evt.pointerId, startSvgX: p.x, startSvgY: p.y, startEntityX: n.x, startEntityY: n.y, moved: false };
  };

  const handlePointerMove = (evt: PointerEvent<SVGGElement>) => {
    const t = dragTrack.current;
    if (!t || t.pointerId !== evt.pointerId) return;
    const p = toSvgPoint(evt.clientX, evt.clientY);
    const dx = p.x - t.startSvgX;
    const dy = p.y - t.startSvgY;
    if (!t.moved && Math.hypot(dx, dy) < 3) return;
    t.moved = true;
    onDragMove(Math.round(t.startEntityX + dx), Math.round(t.startEntityY + dy));
  };

  const handlePointerUp = (evt: PointerEvent<SVGGElement>) => {
    const t = dragTrack.current;
    dragTrack.current = null;
    if (!t || t.pointerId !== evt.pointerId) return;
    if (!t.moved) {
      onClick(evt);
      return;
    }
    const p = toSvgPoint(evt.clientX, evt.clientY);
    onDragEnd(Math.round(t.startEntityX + (p.x - t.startSvgX)), Math.round(t.startEntityY + (p.y - t.startSvgY)));
  };

  const interactionProps =
    mode === "select"
      ? { onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp, onPointerCancel: handlePointerUp }
      : { onClick };

  return (
    <g
      {...interactionProps}
      data-no-pan={mode === "select" ? "true" : undefined}
      style={{ cursor: mode === "select" ? (isDragging ? "grabbing" : "grab") : cursorForMode[mode], opacity: inv ? 1 : dimOpacity, transition: isDragging ? undefined : "opacity .35s" }}
    >
      {hot && <rect x={n.x - 5} y={n.y - 5} width={W + 10} height={H + 10} rx={11} fill="none" stroke="var(--accent)" strokeWidth={6} style={isConnectSource ? undefined : { animation: "eosPulse 1.4s ease-in-out infinite" }} />}
      <rect
        x={n.x}
        y={n.y}
        width={W}
        height={H}
        rx={8}
        fill="var(--card)"
        stroke={hot ? "var(--accent)" : dim && inv ? "var(--accent)" : "var(--band-line)"}
        strokeWidth={hot ? 2.4 : dim && inv ? 1.6 : 1.2}
        style={isDragging ? { filter: "drop-shadow(0 6px 10px rgba(0,0,0,.25))" } : undefined}
      />
      <g
        onPointerDown={(evt) => {
          if (mode === "select") evt.stopPropagation();
        }}
        onClick={(evt) => {
          if (mode !== "select") return;
          evt.stopPropagation();
          onIconClick();
        }}
        style={{ cursor: mode === "select" ? "pointer" : undefined }}
      >
        <title>Cambia icona</title>
        {n.icon ? (
          <image href={resolveIconUrl(n.icon)} x={n.x + 14} y={n.y + 18} width={34} height={34} />
        ) : (
          <g>
            <rect x={n.x + 14} y={n.y + 18} width={34} height={34} rx={7} fill="var(--panel)" stroke="var(--rule)" />
            <text x={n.x + 31} y={n.y + 39} textAnchor="middle" fill="var(--ink)" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 500 }}>
              {n.mono}
            </text>
          </g>
        )}
      </g>
      <text x={n.x + 60} y={n.y + 30} fill="var(--ink)" style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Barlow Semi Condensed',sans-serif" }}>
        <Fitted text={n.n} maxWidth={TITLE_MAX_WIDTH} font={{ size: 15, weight: 700, family: "'Barlow Semi Condensed',sans-serif" }} />
      </text>
      {(n.s ?? []).map((s, i) => (
        <text key={`s${i}`} x={n.x + 60} y={n.y + 47 + i * 15} fill="var(--muted)" style={{ fontSize: 11.5 }}>
          <Fitted text={s} maxWidth={TITLE_MAX_WIDTH} font={{ size: 11.5 }} />
        </text>
      ))}
      {n.mods && (
        <>
          <line x1={n.x + 12} x2={n.x + W - 12} y1={n.y + 62} y2={n.y + 62} stroke="var(--rule)" />
          {n.mods.map((m, i) => {
            const my = n.y + 72 + i * 48;
            const mh = !!hl?.mods.has(m.id);
            const mc = !!(hl?.cur && hl.cur.mods.has(m.id));
            return (
              <g key={m.id}>
                {mc && <rect x={n.x + 9} y={my - 3} width={222} height={46} rx={8} fill="none" stroke="var(--accent)" strokeWidth={4} style={{ animation: "eosPulse 1.4s ease-in-out infinite" }} />}
                <rect x={n.x + 12} y={my} width={216} height={40} rx={5} fill={mc ? "var(--accent-soft)" : "var(--paper)"} stroke={mh ? "var(--accent)" : "var(--rule)"} strokeWidth={mc ? 2.4 : mh ? 1.4 : 1.1} />
                <text x={n.x + 24} y={my + 17} fill="var(--ink)" style={{ fontSize: 12.5, fontWeight: 600 }}>
                  <Fitted text={m.t} maxWidth={MODULE_MAX_WIDTH} font={{ size: 12.5, weight: 600 }} />
                </text>
                <text x={n.x + 24} y={my + 32} fill="var(--muted)" style={{ fontSize: 11 }}>
                  <Fitted text={m.s} maxWidth={MODULE_MAX_WIDTH} font={{ size: 11 }} />
                </text>
              </g>
            );
          })}
        </>
      )}
    </g>
  );
}
