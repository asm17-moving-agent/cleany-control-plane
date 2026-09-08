import wordmark from "../assets/brand/wordmark.png";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { BellIcon, HomeIcon, MapPinIcon, MissionIcon, MonitoringIcon, RobotIcon, SettingsIcon } from "../components/Icons";
import { ChevronIcon, EyeIcon, ShieldIcon } from "../components/WorkspaceIcons";
import { getHomeSummary } from "../lib/home-summary";
import { useOperations } from "../operations/OperationsContext";
import "./workspace-shell.css";

export const facilityFloors = [
  { id: "BUSAN_SOMA_18F", label: "부산 소마 센터 18층", mapAvailable: true },
  { id: "BUSAN_SOMA_19F", label: "부산 소마 센터 19층", mapAvailable: false },
] as const;
export type FacilityFloor = typeof facilityFloors[number];
export interface FacilitySelection { floor: FacilityFloor; }

const navigation = [
  { path: "/", label: "홈", Icon: HomeIcon },
  { path: "/missions", label: "작업", Icon: MissionIcon },
  { path: "/results", label: "결과", Icon: EyeIcon },
  { path: "/robots", label: "로봇", Icon: RobotIcon },
];
const titles: Record<string, string> = {
  "/": "운영 홈", "/missions": "미션 관리", "/results": "작업 결과",
  "/robots": "로봇 관리", "/monitoring": "운영 모니터링", "/settings": "관제 설정",
};
export function AppShell() {
  const location = useLocation();
  const [floor, setFloor] = useState<FacilityFloor>(facilityFloors[0]);
  const { robots, missions, connectionState, error } = useOperations();
  const summary = getHomeSummary(robots, missions);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const alertsRef = useRef<HTMLDetailsElement>(null);
  const isHome = location.pathname === "/";
  useEffect(() => {
    document.title = (titles[location.pathname] ?? "Cleany") + " · Cleany";
    if (menuRef.current) menuRef.current.open = false;
    if (alertsRef.current) alertsRef.current.open = false;
  }, [location.pathname, location.search]);
  return (
    <div className="control-app">
      <header className="workspace-header">
        <Link to="/" className="workspace-brand" aria-label="Cleany 홈"><img src={wordmark} alt="Cleany" width="120" height="34" /></Link>
        <nav className="workspace-navigation" aria-label="주요 메뉴">
          {navigation.map(({ path, label, Icon }) => (
            <NavLink key={path} to={path} end={path === "/"} className={({ isActive }) => isActive ? "is-active" : ""}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="workspace-header-actions">
          <label className="workspace-location"><MapPinIcon aria-hidden="true" />
            <select aria-label="운영 층 선택" value={floor.id} onChange={(event) => setFloor(facilityFloors.find((item) => item.id === event.target.value) ?? facilityFloors[0])}>
              {facilityFloors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <span className="workspace-connection" data-state={error ? "error" : connectionState} role="status">
            <i />{error ? "연결 오류" : connectionState === "connected" ? "연결됨" : connectionState === "error" ? "실시간 연결 끊김" : "연결 확인 중"}
          </span>
          <details className="workspace-menu" ref={alertsRef}>
            <summary aria-label="알림"><BellIcon aria-hidden="true" />{summary.attention.length + summary.review.length > 0 && <i className="notification-dot" />}</summary>
            <div className="workspace-popover">
              <strong>확인할 일</strong>
              <Link to="/robots?filter=attention"><ShieldIcon />즉시 조치 <b>{summary.attention.length}</b></Link>
              <Link to="/results?filter=review"><EyeIcon />결과 검토 <b>{summary.review.length}</b></Link>
            </div>
          </details>
          <details className="workspace-menu" ref={menuRef}>
            <summary aria-label="운영 메뉴"><span className="workspace-avatar">OP</span><ChevronIcon /></summary>
            <div className="workspace-popover">
              <strong>운영자</strong>
              <Link to="/monitoring"><MonitoringIcon />모니터링</Link>
              <Link to="/settings"><SettingsIcon />설정</Link>
            </div>
          </details>
        </div>
      </header>
      <main className={"control-main" + (isHome ? " is-home" : "")}>
        {!isHome && <h1 className="sr-only">{titles[location.pathname]}</h1>}
        {!isHome && error && <div className="workspace-api-error" role="alert">데이터를 갱신하지 못했습니다. {error.message}</div>}
        <Outlet context={{ floor } satisfies FacilitySelection} />
      </main>
    </div>
  );
}
