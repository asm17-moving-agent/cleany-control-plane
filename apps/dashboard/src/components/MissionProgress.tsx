import type { Mission, MissionPhase } from "../api/types";
import { outcomeLabels } from "../lib/home-summary";
import { missionTone } from "../lib/operations";
import { executionSource } from "../lib/execution-source";
import "./mission-progress.css";

const stages = ["접수", "이동", "작업", "복귀", "완료"] as const;
const phaseStage: Record<MissionPhase, number> = {
  QUEUED: 0, OFFERED: 0, ACCEPTED: 0, NAVIGATING: 1, WORKING: 2, RETURNING: 3, TERMINAL: 4,
};
const phaseLabels: Record<MissionPhase, string> = {
  QUEUED: "로봇 배정 대기", OFFERED: "로봇 확인 중", ACCEPTED: "작업 준비 중",
  NAVIGATING: "좌석으로 이동 중", WORKING: "정리 작업 중", RETURNING: "복귀 중", TERMINAL: "종료",
};

export function MissionProgress({ mission }: { mission: Mission }) {
  const terminal = mission.phase === "TERMINAL";
  const success = terminal && mission.outcome === "SUCCESS";
  const current = phaseStage[mission.phase];
  const status = terminal && mission.outcome ? outcomeLabels[mission.outcome] : phaseLabels[mission.phase];
  return <div className="mission-step-progress" role="group" aria-label="작업 진행 상황" data-tone={missionTone(mission)}>
    <ol aria-label="작업 단계">
      {stages.map((stage, index) => {
        // A failed or cancelled terminal response does not confirm every earlier stage.
        const state = success || (!terminal && index < current) ? "done"
          : index === current ? terminal ? "stopped" : "current" : "pending";
        const label = terminal && !success && index === stages.length - 1 ? "종료" : stage;
        return <li key={stage} data-state={state} aria-current={state === "current" ? "step" : undefined}>
          <span className="mission-step-dot" aria-hidden="true">{state === "done" && <svg viewBox="0 0 12 12"><path d="m3 6 2 2 4-4" /></svg>}</span>
          <span>{label}</span><span className="sr-only"> · {state === "done" ? "완료" : state === "current" ? "진행 중" : state === "stopped" ? status : terminal ? "진행 확인 없음" : "대기"}</span>
        </li>;
      })}
    </ol>
    <p className="mission-step-status" role="status">{status}{mission.cancel_requested && !terminal && <span> · 취소 요청 중</span>}</p>
    {mission.execution_profile && <p className="ops-note">{executionSource(mission.execution_profile)}</p>}
  </div>;
}
