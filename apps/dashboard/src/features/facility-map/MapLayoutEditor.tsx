import { useEffect, useMemo, useReducer, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "react-router";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { NativeSelect } from "../../components/ui/native-select";
import { Slider } from "../../components/ui/slider";
import { Details, PageHeader, PageShell, PanelHeader, StatusBadge } from "../../components/patterns";
import { api } from "../../api/client";
import type { components } from "../../api/generated/openapi";
import type { FacilitySelection } from "../../app/AppShell";
import { SlamMapViewport } from "./SlamMapViewport";
import { LayoutEditorCanvas } from "./LayoutEditorCanvas";
import { LayoutReviewDialog } from "./LayoutReviewDialog";
import { displayToSlam, type SlamMapMetadata } from "./slam-map";
import { alignLayoutSeats, cloneLayoutSeats, displayRotation, historyReducer, invalidateLayout, layoutChanges, moveLayoutSeats, rotateLayoutSeats, selectionBounds, updateApproaches, wrapAngle, type Alignment, type EditorMode, type Layout, type LayoutSeat } from "./seat-layout-editor";
import geometry from "./seat-geometry.json";
import "./map-layout-editor.css";

function NumberProperty({ label, value, onValue, min, max, step = .05 }: {
  label: string; value?: number; onValue: (value: number) => void; min?: number; max?: number; step?: number;
}) {
  const format = (n?: number) => n === undefined ? "" : String(Number(n.toFixed(3)));
  const [text, setText] = useState(format(value));
  useEffect(() => setText(format(value)), [value]);
  return <label>{label}<Input controlSize="compact" type="number" value={text} min={min} max={max} step={step} placeholder="여러 값"
    onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
    onBlur={() => { const n = Number(text); if (text.trim() && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onValue(n); setText(format(value)); }} /></label>;
}
const alignments: [Alignment, string][] = [["left", "왼쪽"], ["center-x", "가로 중앙"], ["right", "오른쪽"], ["top", "위쪽"], ["center-y", "세로 중앙"], ["bottom", "아래쪽"]];
const leaveMessage = "저장하지 않은 변경사항이 있습니다. 변경사항을 버리고 나갈까요?";

export function MapLayoutEditor({ map, initial, siteId, registerLeaveGuard }: {
  map: SlamMapMetadata; initial: components["schemas"]["LayoutReview"]; siteId: string;
  registerLeaveGuard?: FacilitySelection["registerLeaveGuard"];
}) {
  const client = useQueryClient(), navigate = useNavigate();
  const [saved, setSaved] = useState(initial.layout);
  const [warnings, setWarnings] = useState(initial.warnings);
  const [history, dispatch] = useReducer(historyReducer, { past: [], present: initial.layout, future: [] });
  const layout = history.present;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = selectedIds.filter(id => layout.seats.some(s => s.seat_id === id));
  const entries = layout.seats.filter(s => selected.includes(s.seat_id)), current = entries[0];
  const [mode, setMode] = useState<EditorMode>("seats");
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [grouped, setGrouped] = useState(true);
  const [snap, setSnap] = useState(.1);
  const [opacity, setOpacity] = useState(75);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const changes = useMemo(() => layoutChanges(saved, layout), [saved, layout]);
  const dirty = changes.length > 0;
  const blocker = useBlocker(dirty || busy);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (!busy && window.confirm(leaveMessage)) blocker.proceed(); else blocker.reset();
  }, [blocker, busy]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty || busy) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);
  useEffect(() => registerLeaveGuard?.(() => !busy && (!dirty || window.confirm(leaveMessage))), [dirty, busy, registerLeaveGuard]);
  function apply(next: Layout) { if (!busy) { dispatch({ type: "apply", layout: next }); setError(""); setNotice(""); } }
  function patchSeats(patch: Partial<LayoutSeat>) {
    apply(invalidateLayout({ ...layout, seats: layout.seats.map(s => selected.includes(s.seat_id) ? { ...s, ...patch, verification: "draft" } : s) }));
  }
  function rotate(degrees: number) {
    const radians = -degrees * Math.PI / 180;
    if (mode === "seats") {
      const bounds = selectionBounds(map, layout, selected);
      const pivot = bounds ? displayToSlam(map, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) : undefined;
      apply(rotateLayoutSeats(layout, selected, radians, pivot));
    }
    else if (mode === "approaches") apply(updateApproaches(layout, selected, { yaw: radians }));
    else if (layout.home) apply(invalidateLayout({ ...layout, home: { ...layout.home, yaw: wrapAngle(layout.home.yaw + radians) } }));
  }
  function duplicate() {
    if (!selected.length || layout.seats.length + selected.length > 300) return;
    const next = cloneLayoutSeats(layout, selected, crypto.randomUUID().slice(0, 8));
    apply(next.layout); setSelectedIds(next.ids);
  }
  function remove() {
    if (!selected.length || selected.length === layout.seats.length) return;
    apply(invalidateLayout({ ...layout, seats: layout.seats.filter(s => !selected.includes(s.seat_id)) })); setSelectedIds([]);
  }
  function add() {
    if (layout.seats.length >= 300) return;
    const id = crypto.randomUUID().slice(0, 8);
    const position = current ? { x: current.pose.x + 1.2, y: current.pose.y } : displayToSlam(map, (map.presentation?.width ?? map.width) / 2, (map.presentation?.height ?? map.height) / 2);
    let number = 1; while (layout.seats.some(s => s.label === `신규 ${number}`)) number++;
    const yaw = current?.pose.yaw ?? wrapAngle(map.origin[2] + ((map.presentation?.rotation_degrees ?? 0) - 90) * Math.PI / 180);
    const depth = geometry.dhub.depth_m, distance = depth / 2 + .8;
    const seat: LayoutSeat = { seat_id: `seat-${id}`, label: `신규 ${number}`, zone_id: current?.zone_id ?? "d-hub", table_id: `table-${id}`, row: 1, grid_column: 1,
      pose: { ...position, yaw }, approach: { x: position.x - Math.cos(yaw) * distance, y: position.y - Math.sin(yaw) * distance, yaw }, width: geometry.dhub.width_m, depth, verification: "draft" };
    apply(invalidateLayout({ ...layout, seats: [...layout.seats, seat] })); setSelectedIds([seat.seat_id]); setTool("select");
  }
  function nudge(dx: number, dy: number) {
    const zero = displayToSlam(map, 0, 0), target = displayToSlam(map, dx / map.resolution, dy / map.resolution);
    const delta = { x: target.x - zero.x, y: target.y - zero.y };
    if (mode === "seats") apply(moveLayoutSeats(layout, selected, delta.x, delta.y));
    else if (mode === "approaches") apply(updateApproaches(layout, selected, delta));
    else if (layout.home) apply(invalidateLayout({ ...layout, home: { ...layout.home, x: layout.home.x + delta.x, y: layout.home.y + delta.y } }));
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (busy || review || !target.closest(".map-editor") || target.closest("input, textarea, select, [contenteditable=true]")) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); }
      else if (modifier && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "redo" }); }
      else if (modifier && event.key.toLowerCase() === "a") { event.preventDefault(); setSelectedIds(layout.seats.map(s => s.seat_id)); }
      else if (modifier && event.key.toLowerCase() === "d" && mode === "seats") { event.preventDefault(); duplicate(); }
      else if (modifier && event.key.toLowerCase() === "s") { event.preventDefault(); if (dirty) setReview(true); }
      else if (["Delete", "Backspace"].includes(event.key) && mode === "seats") { event.preventDefault(); remove(); }
      else if (event.key === "Escape") { setSelectedIds([]); setTool("select"); }
      else if (event.key.toLowerCase() === "v") setTool("select");
      else if (event.key.toLowerCase() === "h") setTool("pan");
      else if (event.key.startsWith("Arrow") && (selected.length || mode === "home")) {
        event.preventDefault(); const step = (snap || .05) * (event.shiftKey ? 10 : 1);
        nudge(event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
      }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  async function save() {
    const labels = layout.seats.map(s => s.label.trim());
    if (labels.some(label => !label) || new Set(labels).size !== labels.length) { setError("좌석 번호를 비우거나 중복해서 사용할 수 없습니다."); return; }
    setBusy(true); setError("");
    try {
      const result = await api.saveSeatLayout(layout, siteId);
      client.setQueryData(["seat-layout", siteId, map.map_id], result);
      setSaved(result.layout); setWarnings(result.warnings); dispatch({ type: "reset", layout: result.layout }); setReview(false); setNotice("저장 완료");
      await client.invalidateQueries({ queryKey: ["operations", "seats"] });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function discard() {
    if (dirty && !window.confirm("변경사항을 취소하고 마지막 저장 배치를 불러올까요?")) return;
    setBusy(true); setError("");
    try {
      const result = await api.seatLayout(siteId);
      client.setQueryData(["seat-layout", siteId, map.map_id], result);
      setSaved(result.layout); setWarnings(result.warnings); dispatch({ type: "reset", layout: result.layout }); setSelectedIds([]); setNotice("변경사항 취소됨");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function download() {
    try {
      const targets = await api.seatTargets(siteId);
      const url = URL.createObjectURL(new Blob([JSON.stringify(targets, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${targets.map_id}-targets-v${targets.layout_revision}-${targets.validation_status}.json`; anchor.click(); URL.revokeObjectURL(url);
    } catch (e) { setError((e as Error).message); }
  }
  const common = (field: "width" | "depth") => entries.length && entries.every(s => s[field] === entries[0][field]) ? entries[0][field] : undefined;
  const pose = mode === "home" ? layout.home : current ? mode === "approaches" ? current.approach : current.pose : null;
  function coordinate(axis: "x" | "y", value: number) {
    if (!pose) return;
    if (mode === "home") apply(invalidateLayout({ ...layout, home: { ...pose, [axis]: value } }));
    else if (mode === "approaches") apply(updateApproaches(layout, selected, { [axis]: value - pose[axis] }));
    else apply(moveLayoutSeats(layout, selected, axis === "x" ? value - pose.x : 0, axis === "y" ? value - pose.y : 0));
  }
  const rotation = pose ? displayRotation(map, pose) : 0;
  return <PageShell width="wide" flow="workspace" className="map-editor" aria-label="좌석 배치 편집 화면">
    <PageHeader title="좌석 배치 편집" action={<div className="page-actions"><StatusBadge tone={dirty ? "warning" : "neutral"}>{dirty ? `변경 ${changes.length}건` : notice || "저장됨"}</StatusBadge>
      <Button disabled={busy || !dirty} onClick={() => void discard()}>변경 취소</Button>
      <Button disabled={busy} onClick={() => navigate(`/map?site=${encodeURIComponent(siteId)}`)}>편집 종료</Button>
      <Button variant="primary" disabled={busy || !dirty} onClick={() => { setError(""); setReview(true); }}>저장</Button></div>} />
    {error && !review && <p className="ui-notice" data-tone="danger" role="alert">{error}</p>}
    <div className="map-editor-workspace">
      <div className="map-editor-toolbar" role="toolbar" aria-label="배치 편집 도구">
        <div className="editor-tool-group">{([["seats", "좌석"], ["approaches", "접근점"], ["home", "복귀점"]] as const).map(([key, label]) =>
          <Button key={key} size="compact" disabled={busy} aria-pressed={mode === key} onClick={() => { setMode(key); setTool("select"); }}>{label}</Button>)}</div>
        <div className="editor-tool-group"><Button size="compact" aria-pressed={tool === "select"} onClick={() => setTool("select")} title="선택 (V)">선택</Button><Button size="compact" aria-pressed={tool === "pan"} onClick={() => setTool("pan")} title="이동 (H)">이동</Button></div>
        <div className="editor-tool-group"><Button size="compact" disabled={busy || !history.past.length} aria-label="실행 취소" title="실행 취소 (Ctrl+Z)" onClick={() => dispatch({ type: "undo" })}>↶</Button><Button size="compact" disabled={busy || !history.future.length} aria-label="다시 실행" title="다시 실행 (Ctrl+Shift+Z)" onClick={() => dispatch({ type: "redo" })}>↷</Button></div>
        <label className="editor-snap">스냅<NativeSelect controlSize="compact" aria-label="스냅 간격" value={snap} onChange={e => setSnap(Number(e.target.value))}><option value={0}>끄기</option><option value={.1}>10 cm</option><option value={.25}>25 cm</option><option value={.5}>50 cm</option></NativeSelect></label>
        <label className="editor-group-toggle"><input type="checkbox" checked={grouped} disabled={mode !== "seats"} onChange={e => setGrouped(e.target.checked)} />묶음 선택</label>
        <div className="editor-tool-group editor-object-actions"><Button size="compact" disabled={busy || mode !== "seats" || layout.seats.length >= 300} onClick={add}>좌석 추가</Button><Button size="compact" disabled={busy || mode !== "seats" || !selected.length || layout.seats.length + selected.length > 300} onClick={duplicate}>복제</Button><Button size="compact" disabled={busy || mode !== "seats" || !selected.length || selected.length === layout.seats.length} onClick={remove}>삭제</Button></div>
      </div>
      <div className="map-editor-body">
        <section className="map-editor-canvas" aria-label="배치 지도">
          <SlamMapViewport map={map} siteId={siteId} footer={<><span>{layout.seats.length}석 · 선택 {selected.length}</span><span>Shift·Ctrl 다중 선택 · 드래그 영역 선택</span></>}>
            {({ scale }) => <LayoutEditorCanvas key={`${mode}:${tool}`} map={map} layout={layout} scale={scale} selected={selected} onSelect={setSelectedIds} onCommit={apply} mode={mode} tool={tool} grouped={grouped} snap={snap} opacity={opacity} disabled={busy || review} />}
          </SlamMapViewport>
        </section>
        <aside className="map-editor-properties" aria-label="좌석 속성">
          <PanelHeader title={mode === "home" ? "복귀점" : selected.length > 1 ? `${selected.length}석 선택` : current ? `${current.label}번 좌석` : "속성"}
            action={mode !== "seats" && <StatusBadge tone="warning">미검증</StatusBadge>} />
          <fieldset disabled={busy} className="editor-property-body">
            {mode !== "home" && <label>좌석 선택<NativeSelect controlSize="compact" aria-label="좌석 선택" value={selected.length === 1 ? selected[0] : ""} onChange={e => setSelectedIds(e.target.value ? [e.target.value] : [])}><option value="">{selected.length > 1 ? `${selected.length}석 선택됨` : "선택 없음"}</option>{layout.seats.map(s => <option key={s.seat_id} value={s.seat_id}>{s.label} · {s.zone_id.toUpperCase()}</option>)}</NativeSelect></label>}
            {mode !== "home" && <label className="editor-opacity"><span>선택 좌석 불투명도<output aria-hidden="true">{opacity}%</output></span><Slider aria-label="선택 좌석 불투명도" aria-valuetext={`${opacity}%`} min={0} max={100} step={5} value={opacity} disabled={!selected.length} onChange={e => setOpacity(Number(e.target.value))} /></label>}
            {mode === "seats" && current && <>
              {selected.length === 1 && <label>좌석 번호<Input controlSize="compact" value={current.label} maxLength={24} onChange={e => patchSeats({ label: e.target.value })} /></label>}
              <div className="editor-property-grid"><NumberProperty label="폭 (m)" value={common("width")} min={.3} max={3} onValue={width => patchSeats({ width })} /><NumberProperty label="깊이 (m)" value={common("depth")} min={.3} max={2} onValue={depth => patchSeats({ depth })} /></div>
            </>}
            {pose && <><div className="editor-rotation"><NumberProperty label={selected.length > 1 && mode !== "home" ? "추가 회전 (°)" : "회전 (°)"} value={selected.length > 1 && mode !== "home" ? 0 : rotation} min={-180} max={180} step={1} onValue={n => rotate(selected.length > 1 && mode !== "home" ? n : n - rotation)} /><Button size="compact" aria-label="왼쪽 15도 회전" onClick={() => rotate(-15)}>↶</Button><Button size="compact" aria-label="오른쪽 15도 회전" onClick={() => rotate(15)}>↷</Button></div>
              {mode === "seats" && selected.length > 1 && <div className="editor-alignment" role="group" aria-label="좌석 정렬">{alignments.map(([key, label]) => <Button key={key} size="compact" aria-label={`${label} 정렬`} onClick={() => apply(alignLayoutSeats(layout, map, selected, key))}>{label}</Button>)}</div>}
              <Details label="고급 설정"><div className="editor-property-grid"><NumberProperty label="X (m)" value={pose.x} onValue={n => coordinate("x", n)} /><NumberProperty label="Y (m)" value={pose.y} onValue={n => coordinate("y", n)} /></div></Details>
            </>}
            {mode === "home" && !layout.home && <p className="editor-empty">지도에서 복귀 위치를 선택하세요.</p>}
            {mode === "approaches" && <p className="editor-empty">마커를 끌어 이동 · 끝점을 끌어 방향 조절</p>}
            {mode === "approaches" && current && warnings[current.seat_id]?.length > 0 && <p className="ui-notice" data-tone="warning">{dirty && "저장된 접근점: "}{warnings[current.seat_id].join(" · ")}</p>}
            <Details label="목표 파일"><Button size="compact" disabled={dirty || busy} onClick={() => void download()}>저장된 목표 좌표 내보내기</Button></Details>
          </fieldset>
        </aside>
      </div>
    </div>
    <LayoutReviewDialog open={review} onClose={() => setReview(false)} changes={changes} error={error} busy={busy} onSave={() => void save()} />
  </PageShell>;
}
