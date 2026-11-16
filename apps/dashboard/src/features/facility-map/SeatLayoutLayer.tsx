import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { api } from "../../api/client";
import type { components } from "../../api/generated/openapi";
import { displayToSlam, slamPixelToDisplay, slamToPixel, type SlamMapMetadata } from "./slam-map";
import geometry from "./seat-geometry.json";
import "./seat-layout.css";

type Layout = components["schemas"]["SeatLayout"];
type Entry = components["schemas"]["LayoutSeat"];
type Pose = components["schemas"]["MetricPose"];
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
export function moveLayoutSeats(layout: Layout, ids: string[], dx: number, dy: number): Layout {
  return { ...layout, home_verified: false, seats: layout.seats.map(seat => ids.includes(seat.seat_id) ? {
    ...seat, verification: "draft", pose: { ...seat.pose, x: seat.pose.x + dx, y: seat.pose.y + dy },
    approach: { ...seat.approach, x: seat.approach.x + dx, y: seat.approach.y + dy },
  } : seat) };
}
export function rotateLayoutSeats(layout: Layout, ids: string[], radians: number): Layout {
  const entries = layout.seats.filter(seat => ids.includes(seat.seat_id));
  if (!entries.length) return layout;
  const cx = entries.reduce((sum, seat) => sum + seat.pose.x, 0) / entries.length;
  const cy = entries.reduce((sum, seat) => sum + seat.pose.y, 0) / entries.length;
  const rotate = (pose: Pose) => ({ x: cx + Math.cos(radians) * (pose.x - cx) - Math.sin(radians) * (pose.y - cy),
    y: cy + Math.sin(radians) * (pose.x - cx) + Math.cos(radians) * (pose.y - cy), yaw: wrap(pose.yaw + radians) });
  return { ...layout, seats: layout.seats.map(seat => ids.includes(seat.seat_id) ?
    { ...seat, pose: rotate(seat.pose), approach: rotate(seat.approach), verification: "draft" } : seat) };
}
function NumberField({ label, value, onChange, step = 0.05 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  const [text, setText] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value]);
  return <label>{label}<input type="number" value={text} step={step} onChange={e => setText(e.target.value)}
    onBlur={() => { const number = Number(text); if (text.trim() && Number.isFinite(number)) onChange(number); else setText(String(value)); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label>;
}
export function SeatLayoutLayer({ map, siteId, scale, stage, onSelectSeat, selectedSeatId }: {
  map: SlamMapMetadata; siteId: string; scale: number; stage: HTMLDivElement | null;
  onSelectSeat: (id: string) => void; selectedSeatId: string | null;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["seat-layout", siteId, map.map_id];
  const query = useQuery({ queryKey, queryFn: () => api.seatLayout(siteId), retry: false, refetchOnWindowFocus: false });
  const [draft, setDraft] = useState<Layout | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState(true);
  const [arrows, setArrows] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<Layout[]>([]);
  const [homePick, setHomePick] = useState(false);
  const drag = useRef<{ start: Layout; ids: string[]; x: number; y: number; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const layout = draft ?? query.data?.layout;
  const current = layout?.seats.find(seat => seat.seat_id === (draft ? selected : selectedSeatId));
  const changed = !!draft && JSON.stringify(draft) !== JSON.stringify(query.data?.layout);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (changed) event.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [changed]);
  const selection = (entry: Entry) => group ? layout!.seats.filter(s => s.table_id === entry.table_id).map(s => s.seat_id) : [entry.seat_id];
  function update(next: Layout) {
    if (!draft || busy) return;
    setHistory(old => [...old.slice(-29), draft]); setDraft(next); setMessage("");
  }
  function editCurrent(patch: Partial<Entry>) {
    if (draft && current) update({ ...draft, seats: draft.seats.map(s => s.seat_id === current.seat_id ? { ...s, ...patch, verification: "draft" } : s) });
  }
  function location(event: PointerEvent) {
    const rect = svg.current!.getBoundingClientRect();
    return displayToSlam(map, (event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale);
  }
  function startDrag(event: PointerEvent<SVGGElement>, seat: Entry) {
    event.stopPropagation();
    if (!draft || busy || event.button !== 0) return;
    setSelected(seat.seat_id);
    if (homePick) return;
    const position = location(event);
    drag.current = { start: draft, ids: selection(seat), ...position, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<SVGGElement>) {
    if (!drag.current) return;
    event.stopPropagation();
    const point = location(event), start = drag.current;
    if (Math.hypot(point.x - start.x, point.y - start.y) > 0.015) start.moved = true;
    if (start.moved) setDraft(moveLayoutSeats(start.start, start.ids, point.x - start.x, point.y - start.y));
  }
  function endDrag(event: PointerEvent<SVGGElement>) {
    event.stopPropagation();
    const start = drag.current;
    if (start?.moved) setHistory(old => [...old.slice(-29), start.start]);
    drag.current = null;
  }
  async function save() {
    if (!draft) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const saved = await api.saveSeatLayout(draft, siteId);
      queryClient.setQueryData(queryKey, saved); setDraft(structuredClone(saved.layout)); setHistory([]);
      await queryClient.invalidateQueries({ queryKey: ["operations", "seats"] });
      setMessage(`배치 v${saved.layout.revision} 저장 완료 · 현장 검증 대기`);
    } catch (error) { setFailed(true); setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setFailed(false);
    try {
      const targets = await api.seatTargets(siteId);
      const url = URL.createObjectURL(new Blob([JSON.stringify(targets, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `${targets.map_id}-targets-v${targets.layout_revision}-${targets.validation_status}.json`; a.click(); URL.revokeObjectURL(url);
      setMessage("저장된 배치의 목표 파일을 받았습니다. 초안은 로봇 실행에 사용할 수 없습니다.");
    } catch (error) { setFailed(true); setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  function clone() {
    if (!current || !draft) return;
    const ids = selection(current), suffix = crypto.randomUUID().slice(0, 8);
    const copies = moveLayoutSeats(draft, ids, 1.2, 0).seats.filter(s => ids.includes(s.seat_id)).map((s, i) => ({
      ...s, seat_id: `seat-${suffix}-${i + 1}`, label: `신규-${suffix.slice(0, 3)}-${i + 1}`, table_id: `table-${suffix}`,
    }));
    update({ ...draft, seats: [...draft.seats, ...copies] }); setSelected(copies[0].seat_id);
  }
  function add() {
    if (!draft) return;
    const center = displayToSlam(map, (map.presentation?.width ?? map.width) / 2, (map.presentation?.height ?? map.height) / 2);
    const id = crypto.randomUUID().slice(0, 8);
    const entry: Entry = { seat_id: `seat-${id}`, label: `신규-${id.slice(0, 3)}`, table_id: `table-${id}`, zone_id: "d-hub", row: 1, grid_column: 1,
      pose: { ...center, yaw: 0 }, approach: { x: center.x - geometry.dhub.depth_m / 2 - 0.8, y: center.y, yaw: 0 }, width: geometry.dhub.width_m, depth: geometry.dhub.depth_m, verification: "draft" };
    update({ ...draft, seats: [...draft.seats, entry] }); setSelected(entry.seat_id);
  }
  const project = (pose: Pose) => slamPixelToDisplay(map, slamToPixel(map, pose.x, pose.y, pose.yaw));
  const panel = <>
    <div className="seat-layout-toolbar" onPointerDown={e => e.stopPropagation()}>
      <button aria-pressed={arrows} onClick={() => setArrows(!arrows)}>접근점 {arrows ? "숨기기" : "보기"}</button>
      <button disabled={!layout || busy} aria-pressed={!!draft} onClick={() => {
        if (draft && changed) { setFailed(true); setMessage("저장하거나 변경 취소 후 편집을 닫아 주세요."); return; }
        setDraft(draft ? null : structuredClone(layout!)); setHistory([]); setMessage(""); setHomePick(false);
      }}>{draft ? "편집 닫기" : "좌석 배치 편집"}</button>
    </div>
    {draft && <aside className="seat-layout-editor" aria-label="좌석 배치 편집기" onPointerDown={e => e.stopPropagation()}>
      <header><div><small>SEAT LAYOUT · v{draft.revision}</small><h2>좌석 배치</h2></div><span>{draft.seats.length}석</span></header>
      <p className="seat-layout-note">책상 묶음을 끌어 위치를 맞추세요.<br />저장한 배치도 현장 검증 전까지는 초안입니다.</p>
      <label className="seat-layout-check"><input type="checkbox" checked={group} onChange={e => setGroup(e.target.checked)} />책상 묶음 함께 이동·회전</label>
      <label>좌석 선택<select aria-label="좌석 선택" value={selected ?? ""} onChange={e => setSelected(e.target.value)}><option value="">지도에서 좌석 선택</option>{draft.seats.map(s => <option key={s.seat_id} value={s.seat_id}>{s.label} · {s.zone_id.toUpperCase()}</option>)}</select></label>
      {current && <>
        <label>좌석 표시 번호<input value={current.label} maxLength={24} onChange={e => editCurrent({ label: e.target.value })} /></label>
        <small className="seat-layout-id">{current.seat_id} · {current.table_id}</small>
        <div className="seat-layout-fields">
          <NumberField label="책상 X (m)" value={current.pose.x} onChange={x => update(moveLayoutSeats(draft, selection(current), x - current.pose.x, 0))} />
          <NumberField label="책상 Y (m)" value={current.pose.y} onChange={y => update(moveLayoutSeats(draft, selection(current), 0, y - current.pose.y))} />
          <NumberField label="폭 (m)" value={current.width} onChange={width => editCurrent({ width })} />
          <NumberField label="깊이 (m)" value={current.depth} onChange={depth => editCurrent({ depth })} />
        </div>
        <div className="seat-layout-actions"><button onClick={() => update(rotateLayoutSeats(draft, selection(current), Math.PI / 12))}>↶ 15° 회전</button><button onClick={() => update(rotateLayoutSeats(draft, selection(current), -Math.PI / 12))}>↷ 15° 회전</button></div>
        <details open><summary>로봇 접근 위치 · 현장 검증 대기</summary><div className="seat-layout-fields">
          <NumberField label="접근 X (m)" value={current.approach.x} onChange={x => editCurrent({ approach: { ...current.approach, x } })} />
          <NumberField label="접근 Y (m)" value={current.approach.y} onChange={y => editCurrent({ approach: { ...current.approach, y } })} />
          <NumberField label="접근 방향 (°)" value={current.approach.yaw * 180 / Math.PI} step={5} onChange={yaw => editCurrent({ approach: { ...current.approach, yaw: wrap(yaw * Math.PI / 180) } })} />
        </div><small>화살표가 책상을 향하도록 맞추세요.</small></details>
        {query.data?.warnings[current.seat_id]?.map(warning => <p className="seat-layout-warning" key={warning}>{warning} {changed && "(저장 전 배치 기준)"}</p>)}
        <div className="seat-layout-actions"><button onClick={clone}>{group ? "책상 묶음 복제" : "좌석 복제"}</button><button onClick={() => { update({ ...draft, seats: draft.seats.filter(s => s.seat_id !== current.seat_id) }); setSelected(null); }}>선택 좌석 삭제</button></div>
      </>}
      <div className="seat-layout-actions"><button onClick={add}>좌석 추가</button><button aria-pressed={homePick} onClick={() => setHomePick(!homePick)}>{homePick ? "지도에서 복귀점 클릭" : "복귀점 지정"}</button></div>
      {draft.home ? <details><summary>복귀점 · 현장 검증 대기</summary><div className="seat-layout-fields">
        <NumberField label="복귀 X (m)" value={draft.home.x} onChange={x => update({ ...draft, home: { ...draft.home!, x } })} />
        <NumberField label="복귀 Y (m)" value={draft.home.y} onChange={y => update({ ...draft, home: { ...draft.home!, y } })} />
        <NumberField label="복귀 방향 (°)" value={draft.home.yaw * 180 / Math.PI} step={5} onChange={yaw => update({ ...draft, home: { ...draft.home!, yaw: wrap(yaw * Math.PI / 180) } })} />
      </div></details> : <small>복귀점 미등록 · 현장에서 지정할 수 있습니다.</small>}
      <footer><div className="seat-layout-actions"><button disabled={!history.length || busy} onClick={() => { setDraft(history[history.length - 1]); setHistory(history.slice(0, -1)); }}>되돌리기</button>
        <button disabled={busy} onClick={async () => { const latest = await query.refetch(); if (latest.data) { setDraft(structuredClone(latest.data.layout)); setHistory([]); setMessage("최신 저장 배치를 불러왔습니다."); setFailed(false); } }}>변경 취소·새로 읽기</button></div>
        <button className="seat-layout-save" disabled={busy || !changed} onClick={() => void save()}>{busy ? "처리 중…" : "배치 저장"}</button>
        <button disabled={busy || changed} onClick={() => void download()}>저장된 목표 좌표 내보내기</button>
      </footer>
      {message && <p role={failed ? "alert" : "status"} className={failed ? "seat-layout-warning" : "seat-layout-note"}>{message}</p>}
    </aside>}
    {query.isError && <div className="seat-layout-load-error" role="alert">좌석 배치를 불러오지 못했습니다. <button onClick={() => void query.refetch()}>다시 시도</button></div>}
  </>;
  return <>
    <svg ref={svg} className={"slam-seat-layer" + (draft ? " is-editing" : "") + (homePick ? " is-picking" : "")}
      width={map.presentation?.width ?? map.width} height={map.presentation?.height ?? map.height}
      onPointerDown={e => { if (draft && homePick) { e.stopPropagation(); update({ ...draft, home: { ...location(e), yaw: 0 }, home_verified: false }); setHomePick(false); } }}>
      <defs><marker id="seat-approach-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0 L5 2.5 L0 5" fill="#cf8b36" /></marker></defs>
      {Array.from(new Set(layout?.seats.map(s => s.zone_id) ?? [])).map(zone => {
        const positions = layout!.seats.filter(s => s.zone_id === zone).map(s => project(s.pose));
        const vertical = ["space-a1", "space-a2", "space-a3"].includes(zone);
        return <text key={zone} className="slam-zone-label" x={positions.reduce((sum, p) => sum + p.x, 0) / positions.length + (vertical ? 25 : 0)}
          y={vertical ? positions.reduce((sum, p) => sum + p.y, 0) / positions.length : Math.min(...positions.map(p => p.y)) - 15} textAnchor={vertical ? "start" : "middle"}>{zone === "d-hub" ? `D-HUB · ${positions.length}` : zone.replace("space-", "SPACE ").toUpperCase()}</text>;
      })}
      {layout?.seats.map(seat => {
        const point = project(seat.pose), approach = project(seat.approach), active = current?.seat_id === seat.seat_id;
        const grouped = draft && current && group && current.table_id === seat.table_id;
        const width = seat.width / map.resolution, depth = seat.depth / map.resolution;
        const chairWidth = (seat.zone_id === "d-hub" ? geometry.dhub.chair_width_m : seat.width * 12 / 38) / map.resolution;
        const chairDepth = (seat.zone_id === "d-hub" ? geometry.dhub.chair_depth_m / 2 : seat.depth * 6 / 28) / map.resolution;
        return <g key={seat.seat_id}>
          {(arrows || active) && <g className="slam-approach"><path d={`M${approach.x} ${approach.y} l${Math.cos((approach.heading ?? 0) * Math.PI / 180) * 12} ${Math.sin((approach.heading ?? 0) * Math.PI / 180) * 12}`} markerEnd="url(#seat-approach-arrow)" />
            <circle cx={approach.x} cy={approach.y} r="3" /><path className="slam-approach-link" d={`M${approach.x} ${approach.y} L${point.x} ${point.y}`} /></g>}
          <g className={"slam-seat" + (active ? " is-selected" : "") + (grouped ? " is-grouped" : "")} role="button" tabIndex={0}
            aria-label={`좌석 ${seat.label}`} aria-pressed={active} data-seat-id={seat.seat_id}
            onPointerDown={e => startDrag(e, seat)} onPointerMove={moveDrag} onPointerUp={endDrag}
            onPointerCancel={e => { if (drag.current) setDraft(drag.current.start); drag.current = null; e.stopPropagation(); }}
            onClick={e => { e.stopPropagation(); if (draft) setSelected(seat.seat_id); else onSelectSeat(seat.seat_id); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (draft) setSelected(seat.seat_id); else onSelectSeat(seat.seat_id); } }}>
            <title>{seat.label} · {seat.verification === "field_verified" ? "현장 검증 완료" : "배치 초안 · 현장 검증 대기"}</title>
            <g transform={`translate(${point.x} ${point.y}) rotate(${point.heading ?? 0})`}>
              <rect className="slam-chair" x={-depth / 2 - chairDepth} y={-chairWidth / 2} width={chairDepth} height={chairWidth} rx="1.8" />
              <rect className="slam-desk" x={-depth / 2} y={-width / 2} width={depth} height={width} rx="1.3" />
            </g>
            <text style={{ fontSize: seat.zone_id === "d-hub" ? 8 : 6.2 }} x={point.x} y={point.y} dominantBaseline="central" textAnchor="middle">{seat.label.replace(/^[AM][1-4]-/, "")}</text>
          </g>
        </g>;
      })}
      {layout?.home && (() => { const p = project(layout.home); return <g className="slam-home" transform={`translate(${p.x} ${p.y})`}><circle r="7" /><text y="2" textAnchor="middle">H</text></g>; })()}
    </svg>
    {stage && createPortal(panel, stage)}
  </>;
}
