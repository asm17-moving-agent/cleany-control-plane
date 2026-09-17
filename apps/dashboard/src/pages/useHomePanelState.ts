import { useEffect, useRef, useState } from "react";
import type { OperationsEvent, Robot, Seat } from "../api/types";
import { PANEL_TRANSITION_MS } from "../components/panel-motion";

type ActivePanel = { kind: "none" } | { kind: "seat"; id: string } | { kind: "robot"; id: string };
type ClosingPanel = { kind: "seat"; seat: Seat } | { kind: "robot"; robot: Robot; missionId: string | null };
type FollowedMission = { robotId: string; missionId: string };

export function useHomePanelState({ robots, seats, events, isCreatingMission, unavailable }: {
  robots: Robot[]; seats: Seat[]; events: OperationsEvent[]; isCreatingMission: boolean; unavailable: boolean;
}) {
  const [active, setActive] = useState<ActivePanel>({ kind: "none" });
  const [closing, setClosing] = useState<ClosingPanel | null>(null);
  const [pendingMissionId, setPendingMissionId] = useState<string | null>(null);
  const [followedMission, setFollowedMission] = useState<FollowedMission | null>(null);
  const [robotFocusKey, setRobotFocusKey] = useState(0);
  const robotTrigger = useRef<HTMLElement | null>(null);
  const focusFrame = useRef<number | null>(null);
  const selectedSeatId = active.kind === "seat" ? active.id : null;
  const selectedRobotId = active.kind === "robot" ? active.id : null;
  const selectedSeat = seats.find(seat => seat.seat_id === selectedSeatId) ?? null;
  const selectedRobot = robots.find(robot => robot.robot_id === selectedRobotId);
  const selectedMissionId = selectedRobot?.active_mission_id
    ?? (followedMission?.robotId === selectedRobotId ? followedMission?.missionId : null) ?? null;

  useEffect(() => {
    if (!closing) return;
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : PANEL_TRANSITION_MS;
    const timer = window.setTimeout(() => setClosing(null), duration);
    return () => window.clearTimeout(timer);
  }, [closing]);
  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, []);

  function transition(next: ActivePanel, follow: FollowedMission | null = null) {
    // A new selection cancels a pending focus restoration from a previous close.
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    setClosing(previous => next.kind === active.kind ? null
      : selectedSeat ? { kind: "seat", seat: selectedSeat }
      : selectedRobot ? { kind: "robot", robot: selectedRobot, missionId: selectedMissionId }
      : previous?.kind === next.kind ? null : previous);
    setActive(next);
    setPendingMissionId(null);
    setFollowedMission(follow);
    if (next.kind === "robot") setRobotFocusKey(key => key + 1);
  }
  function restoreFocus(target: HTMLElement | null) {
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (target?.isConnected && !target.closest("[inert]")) target.focus({ preventScroll: true });
    });
  }
  function closeRobot() {
    transition({ kind: "none" });
    restoreFocus(robotTrigger.current);
  }
  function closeRequest() {
    if (isCreatingMission) return;
    const trigger = document.querySelector<HTMLButtonElement>(".facility-map-seat.is-selected");
    transition({ kind: "none" });
    restoreFocus(trigger);
  }
  function selectRobot(id: string) {
    if (isCreatingMission) return;
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".home-robot-detail-panel")) robotTrigger.current = document.activeElement;
    if (selectedRobotId === id) closeRobot();
    else transition({ kind: "robot", id });
  }
  function selectSeat(id: string) {
    if (isCreatingMission || unavailable) return;
    if (selectedSeatId === id) closeRequest();
    else transition({ kind: "seat", id });
  }

  // Only a confirmed assignment can hand a submitted request over to its robot.
  const assignmentEvent = pendingMissionId ? events.find(event => event.event_type === "robot.state_changed"
    && event.payload.active_mission_id === pendingMissionId) : undefined;
  const assignedRobot = pendingMissionId ? robots.find(robot => robot.active_mission_id === pendingMissionId)
    ?? robots.find(robot => robot.robot_id === assignmentEvent?.robot_id) : undefined;
  useEffect(() => {
    if (!pendingMissionId || !assignedRobot || !selectedSeat) return;
    robotTrigger.current = document.querySelector<HTMLButtonElement>(".facility-map-seat.is-selected");
    transition({ kind: "robot", id: assignedRobot.robot_id }, { robotId: assignedRobot.robot_id, missionId: pendingMissionId });
  }, [pendingMissionId, assignedRobot, selectedSeat]);
  useEffect(() => {
    if (selectedRobot?.active_mission_id) {
      setFollowedMission({ robotId: selectedRobot.robot_id, missionId: selectedRobot.active_mission_id });
    }
  }, [selectedRobot?.robot_id, selectedRobot?.active_mission_id]);

  return {
    selectedSeatId, selectedRobotId, selectedSeat, selectedRobot, robotFocusKey,
    closingSeat: closing?.kind === "seat" ? closing.seat : null,
    displayedRobot: selectedRobot ?? (closing?.kind === "robot" ? closing.robot : null),
    displayedMissionId: selectedRobot ? selectedMissionId : closing?.kind === "robot" ? closing.missionId : null,
    selectSeat, selectRobot, closeRequest, closeRobot,
    onMissionSubmitted: (missionId: string) => {
      if (active.kind === "seat") setPendingMissionId(missionId);
    },
  };
}
