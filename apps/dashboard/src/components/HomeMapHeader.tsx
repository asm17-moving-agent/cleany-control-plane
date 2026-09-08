import type { ReactNode } from "react";
import type { Seat } from "../api/types";
export function HomeMapHeader({ seats, mapAvailable, unavailable, children }: {
  seats: Seat[]; mapAvailable: boolean; unavailable: boolean;
  children?: ReactNode;
}) {
  const occupied = seats.filter(seat => seat.occupancy === "OCCUPIED").length;
  const available = seats.filter(seat => seat.occupancy === "AVAILABLE").length;
  const unknown = seats.length - occupied - available;
  const percent = (count: number) => seats.length ? count / seats.length * 100 : 0;
  const chartLabel = unavailable ? "좌석 점유 현황 확인 중" : seats.length === 0 ? "등록된 좌석 없음"
    : `전체 ${seats.length}석, 사용 중 ${occupied}석, 빈 좌석 ${available}석, 미확인 ${unknown}석`;
  return <header className="home-map-header">
    <div className="home-map-intro">
      <h2>{mapAvailable ? "18층 좌석 지도" : "19층 시설 지도"}</h2>
      <p>{mapAvailable ? "좌석을 선택해 작업을 요청하세요" : "18층을 선택하면 좌석 지도를 볼 수 있습니다"}</p>
    </div>
    <div className="home-map-header-actions">
      {children}
      {mapAvailable && <div className="home-occupancy" role="group" aria-label="좌석 점유 현황">
        <div className="home-occupancy-heading"><span>{unknown ? "확인된 점유" : "좌석 점유율"}</span>
          <strong>{unavailable || !seats.length ? "—" : unknown ? `${occupied} / ${seats.length}석` : `${Math.round(percent(occupied))}%`}</strong>
        </div>
        <div className="home-occupancy-bar" role="img" aria-label={chartLabel}>
          {!unavailable && <>
            <span className="is-occupied" style={{ width: `${percent(occupied)}%` }} />
            <span className="is-available" style={{ width: `${percent(available)}%` }} />
            <span className="is-unknown" style={{ width: `${percent(unknown)}%` }} />
          </>}
        </div>
        <div className="home-occupancy-key" aria-hidden="true">
          <span><i className="is-occupied" />사용 중 <b>{unavailable ? "—" : occupied}</b></span>
          <span><i className="is-available" />빈 좌석 <b>{unavailable ? "—" : available}</b></span>
          {(unavailable || unknown > 0) && <span><i className="is-unknown" />미확인 <b>{unavailable ? "—" : unknown}</b></span>}
        </div>
      </div>}
    </div>
  </header>;
}
