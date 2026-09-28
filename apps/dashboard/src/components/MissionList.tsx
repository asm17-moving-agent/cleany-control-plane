import type { Mission, Seat } from "../api/types";
import { Link } from "react-router";
import { formatDateTime, missionMessage } from "../lib/operations";
import { missionProgress, missionTargetLabel, missionTone } from "../lib/operations";

interface MissionListProps {
  missions: Mission[];
  seats: Seat[];
  emptyMessage?: string;
  onCancel?: (missionId: string) => void;
}

export function MissionList({ missions, seats, emptyMessage, onCancel }: MissionListProps) {
  if (!missions.length) {
    return <p className="empty">{emptyMessage ?? "아직 생성된 Mission이 없습니다."}</p>;
  }

  return missions.map((mission) => {
    const terminal = mission.phase === "TERMINAL";
    return (
      <article className="mission" key={mission.mission_id}>
        <div className="mission-topline">
          <div>
            <strong>{missionTargetLabel(mission, seats)}</strong>
            <small>{mission.mission_id.slice(0, 8)}</small>
          </div>
          <div className="badges">
            <span className={`priority ${mission.priority.toLowerCase()}`}>{mission.priority}</span>
            <span className={`phase ${missionTone(mission)}`}>{mission.outcome ?? mission.phase}</span>
          </div>
        </div>
        <div className="progress"><i style={{ width: `${missionProgress(mission.phase)}%` }} /></div>
        <p>{missionMessage(mission.message)}</p>
        <div className="mission-footer">
          <small>요청 {formatDateTime(mission.created_at)}</small>
          {terminal && <Link to={"/results?mission=" + encodeURIComponent(mission.mission_id)}>결과 보기 →</Link>}
          {!terminal && onCancel ? (
            <button className="danger" type="button" onClick={() => onCancel(mission.mission_id)}>
              취소 요청
            </button>
          ) : null}
        </div>
      </article>
    );
  });
}
