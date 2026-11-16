import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, scopedUrl } from "../../api/client";
import type { Robot, RobotPose } from "../../api/types";
import type { MapPose } from "../robot-pose/robot-pose";
import { slamPixelToDisplay, slamToPixel, type SlamMapMetadata } from "./slam-map";
import { SeatLayoutLayer } from "./SeatLayoutLayer";
import { useMapCamera } from "./useMapCamera";
import robotFaceSoft from "../../assets/brand/robot-face-soft.svg";
import "./facility-map.css";
import "./slam-map.css";

type Props = {
  siteId: string; robot?: Robot; pose: MapPose | null; sourcePose?: RobotPose | null;
  stale: boolean; selectedRobotId: string | null; robotFocusKey: number;
  onSelectRobot: (id: string) => void;
  onSelectSeat: (id: string) => void; selectedSeatId: string | null;
};
export function SlamMap(props: Props) {
  const query = useQuery({ queryKey: ["slam-map", props.siteId], queryFn: api.map, retry: false });
  if (query.isPending) return <div className="floor-map-empty" role="status">지도를 불러오는 중입니다.</div>;
  if (query.isError) return <div className="floor-map-empty" role="alert"><h2>지도를 불러오지 못했습니다.</h2><p>{query.error.message}</p><button onClick={() => void query.refetch()}>다시 불러오기</button></div>;
  return <SlamMapCanvas key={props.siteId + query.data.map_id} {...props} map={query.data} />;
}
function SlamMapCanvas({ map, siteId, onSelectSeat, selectedSeatId, robot, pose, sourcePose, stale, selectedRobotId, robotFocusKey, onSelectRobot }: Props & { map: SlamMapMetadata }) {
  const [imageError, setImageError] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const presentation = map.presentation;
  const original = showOriginal || !presentation;
  const compatible = sourcePose?.frame_id === map.frame_id && sourcePose?.map_id === map.map_id;
  const point = pose && compatible ? slamPixelToDisplay(map, slamToPixel(map, pose.x, pose.y, pose.yaw)) : null;
  const markers = robot && point ? [{ robotId: robot.robot_id, ...point }] : [];
  const bounds = { x: 0, y: 0, width: presentation?.width ?? map.width, height: presentation?.height ?? map.height };
  const { stage, camera, dragging, panHandlers, zoomBy, fitView, canZoomIn, canZoomOut } = useMapCamera({
    robots: markers, selectedRobotId, robotFocusKey, fullBounds: bounds, activeBounds: bounds, overlayInsetLeft: 320, initialMode: "all",
  });
  return <div className={"facility-map-shell slam-map-shell" + (original ? " is-original" : "")}>
    <div className={"facility-map-stage" + (dragging ? " is-panning" : "")} ref={stage} {...panHandlers}>
      <div className="facility-plan-canvas" style={{ width: bounds.width, height: bounds.height, "--map-scale": camera.scale, transform: camera.transform } as CSSProperties}>
        <img key={String(original)} className="slam-map-raster"
          style={{ transform: presentation ? `matrix(${presentation.transform.join(",")})` : undefined }}
          src={scopedUrl(original ? (map.image_url ?? "/api/map/image") : (presentation!.image_url ?? "/api/map/presentation"))} width={map.width} height={map.height}
          alt={original ? "SLAM으로 작성한 실측 점유 지도" : "실측 SLAM 기반 운영 지도"} draggable={false}
          onLoad={() => setImageError(false)} onError={() => setImageError(true)} />
        <SeatLayoutLayer map={map} siteId={siteId} scale={camera.scale} stage={stage.current} onSelectSeat={onSelectSeat} selectedSeatId={selectedSeatId} />
        {robot && point && <button className={"facility-map-robot" + (stale ? " is-stale" : "")} style={{ left: point.x, top: point.y }}
          aria-label={`${robot.robot_id} 로봇 · ${stale ? "위치 지연" : "실시간 위치"}`} onClick={() => onSelectRobot(robot.robot_id)}>
          <svg className="facility-robot-bearing" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="36" />
            {point.heading !== undefined && <g transform={`rotate(${point.heading} 50 50)`}><path d="M 97 50 L 84 43 L 84 57 Z" /></g>}
          </svg><img src={robotFaceSoft} alt="" width="42" height="36" draggable={false} />
        </button>}
      </div>
      {presentation && <div className="slam-map-view-switch" role="group" aria-label="지도 표시 방식">
        <button aria-pressed={!original} onClick={() => setShowOriginal(false)}>운영 지도</button>
        <button aria-pressed={original} onClick={() => setShowOriginal(true)}>SLAM 원본</button>
      </div>}
      <div className="slam-map-scale" aria-label="지도 축척 2미터"><span style={{ width: 2 / map.resolution * camera.scale }} />2 m</div>
      <div className="facility-map-controls" aria-label="지도 조작"><div className="facility-map-zoom-controls">
        <button aria-label="지도 확대" disabled={!canZoomIn} onClick={() => zoomBy(1.25)}>+</button>
        <button aria-label="지도 축소" disabled={!canZoomOut} onClick={() => zoomBy(0.8)}>−</button>
      </div><button onClick={() => fitView("all")}>전체 보기</button></div>
    </div>
    <div className="facility-map-legend" aria-label="지도 범례"><strong>{original ? map.label : "SLAM 구조 요약"}</strong><span><i className="slam-swatch occupied" />{original ? "장애물" : "주요 구조"}</span><span><i className="slam-swatch free" />{original ? "관측된 빈 공간" : "실내 영역"}</span><span><i className="slam-swatch unknown" />{original ? "미관측" : "외부·미관측"}</span>
      {!original && <span>세부 관측은 원본 보기</span>}<span>좌석 배치 초안 · 현장 검증 대기</span>{!compatible && <span role="status">지도 기준 로봇 위치 대기 중</span>}
      {imageError && <span role="alert">지도 이미지를 불러오지 못했습니다.</span>}
    </div>
  </div>;
}
