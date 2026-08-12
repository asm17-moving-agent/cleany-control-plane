import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Seat } from "../api/types";
import { SendIcon } from "../components/Icons";
import { MissionList } from "../components/MissionList";
import {
  DISPLAY_GRID_COLUMNS,
  SEAT_COLUMN_LABELS,
  seatLocation,
  seatPosition,
} from "../lib/operations";
import { useOperations } from "../operations/OperationsContext";
import { useSettings } from "../settings/SettingsContext";

const missionFormSchema = z.object({
  priority: z.enum(["NORMAL", "HIGH"]),
});

type MissionFormValues = z.infer<typeof missionFormSchema>;

interface SeatMapProps {
  seats: Seat[];
  selectedSeatId: string | null;
  onSelect: (seatId: string) => void;
}

function SeatMap({ seats, selectedSeatId, onSelect }: SeatMapProps) {
  return (
    <section className="seat-map-shell" aria-labelledby="seat-map-title">
      <h3 id="seat-map-title" className="visually-hidden">대상 좌석 선택</h3>
      <div className="floorplan-frame">
        <div className="floorplan">
          <div className="seat-map">
            {SEAT_COLUMN_LABELS.map((label, index) => (
              <span
                className="seat-column-label"
                key={label}
                style={{ gridColumn: DISPLAY_GRID_COLUMNS[index], gridRow: 1 }}
              >
                {label}
              </span>
            ))}
            {seats.map((seat) => {
              const selected = seat.seat_id === selectedSeatId;
              const occupied = seat.occupancy === "OCCUPIED";
              const position = seatPosition(seat);
              const description = occupied ? `${seat.occupant_name} 사용 중` : "비어 있음";
              return (
                <button
                  aria-label={`${seat.label}번 좌석 ${description}${selected ? ", 선택됨" : ""}`}
                  aria-pressed={selected}
                  className={`seat ${occupied ? "is-occupied" : "is-available"}${selected ? " is-selected" : ""}`}
                  key={seat.seat_id}
                  onClick={() => onSelect(seat.seat_id)}
                  style={{ gridColumn: position.column, gridRow: position.gridRow }}
                  title={occupied
                    ? `${seat.label}번 · ${seat.occupant_name} 사용 중 · 시나리오 선택 가능`
                    : `${seat.label}번 · 비어 있음`}
                  type="button"
                >
                  <strong>{seat.label}</strong>
                </button>
              );
            })}
          </div>
          <span className="door door-left" role="img" aria-label="왼쪽 출입문" />
          <span className="door door-right" role="img" aria-label="오른쪽 출입문" />
        </div>
      </div>
      <p className="map-scroll-hint">좌우로 이동하여 전체 좌석을 확인하세요.</p>
    </section>
  );
}

export function HomePage() {
  const {
    seats,
    missions,
    createMission,
    cancelMission,
    refresh,
    isCreatingMission,
  } = useOperations();
  const { settings } = useSettings();
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const { register, handleSubmit } = useForm<MissionFormValues>({
    resolver: zodResolver(missionFormSchema),
    defaultValues: { priority: settings.defaultPriority },
  });
  const selectedSeat = seats.find(({ seat_id }) => seat_id === selectedSeatId) ?? null;

  const selectSeat = (seatId: string) => {
    setSelectedSeatId((current) => current === seatId ? null : seatId);
    setMessage("");
  };

  const submitMission = handleSubmit(async ({ priority }) => {
    if (!selectedSeatId) {
      setMessage("먼저 작업 대상 좌석을 선택해 주세요.");
      return;
    }
    setMessage("Mission을 생성하는 중입니다.");
    try {
      await createMission({
        seat_id: selectedSeatId,
        priority,
        requested_by: "scenario-operator",
        idempotency_key: crypto.randomUUID(),
      });
      setMessage("Mission을 Queue에 등록했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission 생성에 실패했습니다.");
    }
  });

  const requestCancel = async (missionId: string) => {
    try {
      await cancelMission(missionId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "취소 요청에 실패했습니다.");
    }
  };

  return (
    <section className="workspace dashboard-view">
      <article className="panel request-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">MISSION REQUEST</p><h2>좌석 작업 요청</h2><p>배치도에서 좌석을 선택해 Mission을 생성합니다.</p></div>
        </div>
        <div className="map-divider"><i /><span>배치도</span><i /></div>
        <div className="request-layout">
          <aside className="seat-guide" aria-label="좌석 안내">
            <div className="guide-heading"><strong>좌석 상태 안내</strong></div>
            <div className="guide-items">
              <span><i className="guide-seat available" />선택 가능 좌석</span>
              <span><i className="guide-seat selected" />선택된 좌석</span>
              <span><i className="guide-seat occupied" />사용 중 좌석</span>
            </div>
            <p>사용 중 좌석도 관제 시나리오 검증을 위해 선택할 수 있습니다.</p>
            <div className="guide-facilities">
              <span><i className="facility selection" />단일 선택</span>
              <span><i className="facility aisle" />통로</span>
              <span><i className="facility entrance" />출입문</span>
            </div>
          </aside>

          <SeatMap seats={seats} selectedSeatId={selectedSeatId} onSelect={selectSeat} />

          <form className="mission-controls" onSubmit={submitMission}>
            <section className="selection-card" aria-live="polite">
              <div className="control-heading"><strong>선택한 좌석</strong><span>{selectedSeat ? "1개 선택됨" : "0개 선택됨"}</span></div>
              <div className="selection-content">
                {selectedSeat ? <span className="selected-seat-chip">{selectedSeat.label}</span> : null}
                <div>
                  <strong>{selectedSeat ? seatLocation(selectedSeat) : "좌석을 선택하세요"}</strong>
                  <small>{selectedSeat
                    ? selectedSeat.occupancy === "OCCUPIED"
                      ? `${selectedSeat.label}번 · ${selectedSeat.occupant_name} 사용 중`
                      : `${selectedSeat.label}번 · 비어 있음`
                    : "배치도에서 작업 대상을 선택합니다."}</small>
                </div>
                {selectedSeat ? (
                  <button className="clear-seat" type="button" aria-label="선택 해제" onClick={() => setSelectedSeatId(null)}>×</button>
                ) : null}
              </div>
            </section>
            <section className="priority-card">
              <label>우선순위
                <select {...register("priority")}>
                  <option value="NORMAL">보통 (NORMAL)</option>
                  <option value="HIGH">높음 (HIGH)</option>
                </select>
              </label>
              <p className="priority-note"><span>i</span>우선순위가 높을수록 먼저 처리됩니다.</p>
              <button className="submit-mission" type="submit" disabled={!selectedSeat || isCreatingMission}>
                <SendIcon />Mission 요청
              </button>
              <p className="form-message" aria-live="polite">{message}</p>
            </section>
          </form>
        </div>
      </article>

      <article className="panel missions-panel home-recent-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">RECENT MISSIONS</p><h2>최근 미션</h2></div>
          <button className="secondary" type="button" onClick={() => void refresh()}>새로고침</button>
        </div>
        <div className="missions">
          <MissionList missions={missions.slice(0, 3)} seats={seats} onCancel={(id) => void requestCancel(id)} />
        </div>
      </article>
    </section>
  );
}
