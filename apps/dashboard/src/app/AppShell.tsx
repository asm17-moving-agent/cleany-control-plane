import { useAuthOptional } from "../auth/AuthContext";
import wordmark from "../assets/brand/wordmark.png";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { BellIcon, HomeIcon, MapPinIcon, MissionIcon, MonitoringIcon, RobotIcon, SettingsIcon } from "../components/Icons";
import { ChevronIcon, EyeIcon, ShieldIcon } from "../components/WorkspaceIcons";
import { getHomeSummary } from "../lib/home-summary";
import { useOperations } from "../operations/OperationsContext";
import { useDemoMode } from "../operations/DemoModeContext";
import { homeSummaryDemo } from "../lib/home-summary-demo";
import "./workspace-shell.css";

export const facilityFloors = [
  { id: "BUSAN_SOMA_18F", label: "부산 소마 센터 18층", mapAvailable: true },
  { id: "BUSAN_SOMA_19F", label: "부산 소마 센터 19층", mapAvailable: false },
] as const;
export interface FacilityFloor { id: string; label: string; mapAvailable: boolean; }
export interface FacilitySelection { floor: FacilityFloor; }

const navigation = [
  { path: "/", label: "홈", Icon: HomeIcon },
  { path: "/missions", label: "작업", Icon: MissionIcon },
  { path: "/results", label: "결과", Icon: EyeIcon },
  { path: "/robots", label: "로봇", Icon: RobotIcon },
];
const titles: Record<string, string> = {
  "/": "운영 홈", "/missions": "작업 요청", "/results": "작업 결과",
  "/robots": "로봇 관리", "/monitoring": "운영 모니터링", "/settings": "관제 설정",
};
export function AppShell() {
  const location = useLocation();
  const auth = useAuthOptional();
  const floors = auth ? auth.sites.map(site => ({ id: site.site_id, label: site.display_name,
    mapAvailable: site.map_ref === "facility-18f" })) : facilityFloors;
  const [localFloor, setFloor] = useState<FacilityFloor>(facilityFloors[0]);
  const floor = auth ? floors.find(item => item.id === auth.site?.site_id) ?? localFloor : localFloor;
  const { robots, missions, error, isLoading } = useOperations();
  const { isDemo, isRecording, setDemoMode } = useDemoMode();
  const demo = !isDemo && location.pathname === "/" && new URLSearchParams(location.search).get("summaryDemo") === "1";
  const summary = demo ? getHomeSummary(homeSummaryDemo.robots, homeSummaryDemo.missions) : getHomeSummary(robots, missions);
  const alertsReady = demo || (!isLoading && !error);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const alertsRef = useRef<HTMLDetailsElement>(null);
  const isHome = location.pathname === "/";
  const hasPageError = ["/missions", "/results", "/robots"].includes(location.pathname);
  useEffect(() => {
    document.title = (titles[location.pathname] ?? "Cleany") + " · Cleany";
    if (menuRef.current) menuRef.current.open = false;
    if (alertsRef.current) alertsRef.current.open = false;
  }, [location.pathname, location.search]);
  return (
    <div className={"control-app" + (isDemo ? " is-demo" : "") + (isRecording ? " is-recording" : "")}>
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
            <select aria-label="운영 층 선택" value={floor.id} onChange={(event) => auth ? auth.selectSite(event.target.value) : setFloor(floors.find((item) => item.id === event.target.value) ?? facilityFloors[0])}>
              {floors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <details className="workspace-menu" ref={alertsRef}>
            <summary aria-label="알림"><BellIcon aria-hidden="true" /><span className={"header-alert-count attention" + (summary.attention.length ? " has-items" : "")}>조치 {alertsReady ? summary.attention.length : "—"}</span><span className={"header-alert-count review" + (summary.review.length ? " has-items" : "")}>검토 {alertsReady ? summary.review.length : "—"}</span></summary>
            <div className="workspace-popover">
              <strong>확인할 일{demo ? " · 예시 데이터" : ""}</strong>
              <Link to="/robots?filter=attention"><ShieldIcon />즉시 조치 <b>{alertsReady ? summary.attention.length : "—"}</b></Link>
              <Link to="/results?filter=review"><EyeIcon />결과 검토 <b>{alertsReady ? summary.review.length : "—"}</b></Link>
            </div>
          </details>
          <details className="workspace-menu" ref={menuRef}>
            <summary aria-label="운영 메뉴"><span className="workspace-avatar">운영자</span><ChevronIcon /></summary>
            <div className="workspace-popover">
              <strong>{auth?.session?.display_name ?? "운영자"}</strong>
              <Link to="/monitoring"><MonitoringIcon />모니터링</Link>
              <Link to="/settings"><SettingsIcon />설정</Link>
              {auth && <button type="button" onClick={() => void auth.logout()}>로그아웃</button>}
              {!isDemo && <button type="button" onClick={() => setDemoMode(true)}>예시 데이터 보기</button>}
              {!isRecording && <Link to="/?recording=1">촬영 모드</Link>}
            </div>
          </details>
        </div>
      </header>
      {isDemo && <div className="workspace-demo-banner" role="status"><span><strong>{isRecording ? "촬영 모드" : "예시 데이터"}</strong> {isRecording ? "좌석 요청 → 이동 → 작업 → 복귀 · 실제 로봇에는 전송하지 않습니다. 새로고침하면 초기화됩니다." : "로봇 3대 · 요청 7건 · 결과 사진은 AI 생성 이미지입니다. 작업 요청·취소는 전송되지 않습니다."}</span><button type="button" onClick={() => setDemoMode(false)}>실제 데이터로 돌아가기 <ChevronIcon /></button></div>}
      <main className={"control-main" + (isHome ? " is-home" : "")}>
        {!isHome && <h1 className="sr-only">{titles[location.pathname]}</h1>}
        {!isHome && !hasPageError && error && <div className="workspace-api-error" role="alert">데이터를 갱신하지 못했습니다. {error.message}</div>}
        <Outlet context={{ floor } satisfies FacilitySelection} />
      </main>
    </div>
  );
}
