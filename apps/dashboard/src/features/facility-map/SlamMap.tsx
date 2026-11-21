import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";
import type { Robot, RobotPose, Seat } from "../../api/types";
import type { SeatCleaningStates } from "../../lib/seat-summary";
import type { MapPose } from "../robot-pose/robot-pose";
import { slamPixelToDisplay, slamToPixel } from "./slam-map";
import { SeatLayoutLayer } from "./SeatLayoutLayer";
import { SlamMapViewport } from "./SlamMapViewport";
import robotFaceSoft from "../../assets/brand/robot-face-soft.svg";
import { Button } from "../../components/ui/button";

type Props = {
  siteId: string; robot?: Robot; pose: MapPose | null; sourcePose?: RobotPose | null;
  stale: boolean; selectedRobotId: string | null; robotFocusKey: number;
  onSelectRobot: (id: string) => void; seats?: Seat[]; seatCleaning?: SeatCleaningStates;
  onSelectSeat: (id: string) => void; selectedSeatId: string | null;
};
export function SlamMap({ siteId, onSelectSeat, selectedSeatId, robot, pose, sourcePose, stale, selectedRobotId, robotFocusKey, onSelectRobot, seats, seatCleaning }: Props) {
  const query = useQuery({ queryKey: ["slam-map", siteId], queryFn: api.map, retry: false });
  const layout = useQuery({ queryKey: ["seat-layout", siteId, query.data?.map_id], queryFn: () => api.seatLayout(siteId), enabled: !!query.data, retry: false });
  if (query.isPending) return <div className="floor-map-empty" role="status">지도를 불러오는 중입니다.</div>;
  if (query.isError) return <div className="floor-map-empty" role="alert"><h2>지도를 불러오지 못했습니다.</h2><p>{query.error.message}</p><Button onClick={() => void query.refetch()}>다시 불러오기</Button></div>;
  const map = query.data;
  const compatible = sourcePose?.frame_id === map.frame_id && sourcePose?.map_id === map.map_id;
  const point = pose && compatible ? slamPixelToDisplay(map, slamToPixel(map, pose.x, pose.y, pose.yaw)) : null;
  return <SlamMapViewport key={siteId + map.map_id} map={map} siteId={siteId} overlayInsetLeft={320}
    robots={robot && point ? [{ robotId: robot.robot_id, ...point }] : []} selectedRobotId={selectedRobotId} robotFocusKey={robotFocusKey}
    footer={<>{!compatible && <span role="status">지도 기준 로봇 위치 대기 중</span>}
      {layout.isError && <span role="alert">좌석 배치를 불러오지 못했습니다. <Button size="compact" onClick={() => void layout.refetch()}>다시 시도</Button></span>}</>}>
    {() => <>
      {layout.data && <SeatLayoutLayer map={map} layout={layout.data.layout} selectedIds={selectedSeatId ? [selectedSeatId] : []} onSelectSeat={onSelectSeat} seats={seats} seatCleaning={seatCleaning} />}
      {robot && point && <button className={"facility-map-robot" + (stale ? " is-stale" : "")} style={{ left: point.x, top: point.y }}
        aria-label={`${robot.robot_id} 로봇 · ${stale ? "위치 지연" : "실시간 위치"}`} onClick={() => onSelectRobot(robot.robot_id)}>
        <svg className="facility-robot-bearing" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="36" />
          {point.heading !== undefined && <g transform={`rotate(${point.heading} 50 50)`}><path d="M 97 50 L 84 43 L 84 57 Z" /></g>}
        </svg><img src={robotFaceSoft} alt="" width="42" height="36" draggable={false} />
      </button>}
    </>}
  </SlamMapViewport>;
}
