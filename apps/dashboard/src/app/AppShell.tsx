import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuthOptional } from "../auth/AuthContext";
import wordmark from "../assets/brand/wordmark.png";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { BellIcon, HomeIcon, MapPinIcon, MissionIcon, RobotIcon, SettingsIcon } from "../components/Icons";
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
export interface FacilityFloor { id: string; label: string; mapAvailable: boolean; mapRef?: string; }
export interface FacilitySelection { floor: FacilityFloor; }

const navigation = [
  { path: "/", label: "홈", Icon: HomeIcon },
  { path: "/map", label: "지도", Icon: MapPinIcon },
  { path: "/missions", label: "작업", Icon: MissionIcon },
  { path: "/robots", label: "로봇", Icon: RobotIcon },
  { path: "/settings", label: "설정", Icon: SettingsIcon },
];
const titles: Record<string, string> = {
  "/": "운영 현황", "/map": "시설 지도", "/missions": "작업", "/results": "작업 결과",
  "/robots": "로봇 관제", "/monitoring": "운영 모니터링", "/settings": "관제 설정",
};
/** Share navigation and facility selection across routes, keeping document titles synchronized. */
export function AppShell() {
  const location = useLocation();
  const auth = useAuthOptional();
  const floors = auth ? auth.sites.map(site => ({ id: site.site_id, label: site.display_name,
    mapRef: site.map_ref, mapAvailable: site.map_ref !== "unconnected" })) : facilityFloors;
  const [localFloor, setFloor] = useState<FacilityFloor>(facilityFloors[0]);
  const floor = auth ? floors.find(item => item.id === auth.site?.site_id) ?? localFloor : localFloor;
  const { robots, missions, error, isLoading } = useOperations();
  const { isDemo, isRecording, setDemoMode } = useDemoMode();
  const demo = !isDemo && location.pathname === "/map" && new URLSearchParams(location.search).get("summaryDemo") === "1";
  const summary = demo ? getHomeSummary(homeSummaryDemo.robots, homeSummaryDemo.missions) : getHomeSummary(robots, missions);
  const alertsReady = demo || (!isLoading && !error);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const isMap = location.pathname === "/map";
  const hasPageError = ["/", "/missions", "/results", "/robots"].includes(location.pathname);
  useEffect(() => {
    document.title = (titles[location.pathname] ?? "Cleany") + " · Cleany";
    setMenuOpen(false);
    setAlertsOpen(false);
  }, [location.pathname, location.search]);
  return (
    <div className={"control-app" + (isDemo ? " is-demo" : "") + (isRecording ? " is-recording" : "")}>
      <header className="workspace-header">
        <Link to="/" className="workspace-brand" aria-label="Cleany 홈"><img src={wordmark} alt="Cleany" width="120" height="34" /></Link>
        <nav className="workspace-navigation" aria-label="주요 메뉴">
          {navigation.map(({ path, label, Icon }) => {
            const active = location.pathname === path || (path === "/missions" && location.pathname === "/results");
            return <Link key={path} to={path} aria-current={active ? "page" : undefined} className={active ? "is-active" : ""}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </Link>;
          })}
        </nav>
        <div className="workspace-header-actions">
          <label className="workspace-location"><MapPinIcon aria-hidden="true" />
            <NativeSelect aria-label="운영 층 선택" value={floor.id} onChange={(event) => auth ? auth.selectSite(event.target.value) : setFloor(floors.find((item) => item.id === event.target.value) ?? facilityFloors[0])}>
              {floors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </NativeSelect>
          </label>
          <div className="workspace-menu">
            <DropdownMenu modal={false} open={alertsOpen} onOpenChange={setAlertsOpen}>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="default" type="button" className="workspace-menu-trigger" aria-label="알림"><BellIcon aria-hidden="true" /><span className={"header-alert-count attention" + (summary.attention.length ? " has-items" : "")}>조치 {alertsReady ? summary.attention.length : "—"}</span><span className={"header-alert-count review" + (summary.review.length ? " has-items" : "")}>검토 {alertsReady ? summary.review.length : "—"}</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent className="workspace-popover" align="end" sideOffset={12}>
                <DropdownMenuLabel>확인할 일{demo ? " · 예시 데이터" : ""}</DropdownMenuLabel>
                <DropdownMenuItem asChild><Link to="/robots?filter=attention"><ShieldIcon />즉시 조치 <b>{alertsReady ? summary.attention.length : "—"}</b></Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/missions?filter=REVIEW"><EyeIcon />결과 검토 <b>{alertsReady ? summary.review.length : "—"}</b></Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="workspace-menu">
            <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="default" type="button" className="workspace-menu-trigger" aria-label="운영 메뉴"><span className="workspace-avatar">운영자</span><ChevronIcon /></Button></DropdownMenuTrigger>
              <DropdownMenuContent className="workspace-popover" align="end" sideOffset={12}>
                <DropdownMenuLabel>{auth?.session?.display_name ?? "운영자"}</DropdownMenuLabel>
                {auth && <DropdownMenuItem onSelect={() => void auth.logout()}>로그아웃</DropdownMenuItem>}
                {!isDemo && <DropdownMenuItem onSelect={() => setDemoMode(true)}>예시 데이터 보기</DropdownMenuItem>}
                {!isRecording && <DropdownMenuItem asChild><Link to="/map?recording=1">촬영 모드</Link></DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      {isDemo && <div className="workspace-demo-banner" role="status"><span><strong>{isRecording ? "촬영 모드" : "예시 데이터"}</strong> · 실제 명령 미전송{isRecording && " · 새로고침 시 초기화"}</span><Button variant="secondary" size="default" type="button" onClick={() => setDemoMode(false)}>실제 데이터로 돌아가기 <ChevronIcon /></Button></div>}
      <main data-flow={["/missions", "/results", "/robots", "/map"].includes(location.pathname) ? "workspace" : "document"} className="control-main">
        {!isMap && <h1 className="sr-only">{titles[location.pathname]}</h1>}
        {!isMap && !hasPageError && error && <div className="workspace-api-error" role="alert">데이터를 갱신하지 못했습니다. {error.message}</div>}
        <Outlet context={{ floor } satisfies FacilitySelection} />
      </main>
    </div>
  );
}
