import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  BellIcon,
  ClipboardIcon,
  FlagIcon,
  HomeIcon,
  MissionIcon,
  MonitoringIcon,
  RobotIcon,
  SettingsIcon,
} from "../components/Icons";
import { useOperations } from "../operations/OperationsContext";
import logoUrl from "../../logo.svg?url";

const navigation = [
  { path: "/", label: "홈", Icon: HomeIcon },
  { path: "/missions", label: "미션", Icon: MissionIcon },
  { path: "/monitoring", label: "모니터링", Icon: MonitoringIcon },
  { path: "/robots", label: "로봇", Icon: RobotIcon },
  { path: "/settings", label: "설정", Icon: SettingsIcon },
] as const;

const routeMeta: Record<string, { title: string; documentTitle: string }> = {
  "/": { title: "안녕하세요, 운영자님! 👋", documentTitle: "Cleany Operations" },
  "/missions": { title: "미션 관리", documentTitle: "Mission · Cleany" },
  "/monitoring": { title: "운영 모니터링", documentTitle: "Monitoring · Cleany" },
  "/robots": { title: "로봇 관리", documentTitle: "Robots · Cleany" },
  "/settings": { title: "관제 설정", documentTitle: "Settings · Cleany" },
};

export function AppShell() {
  const location = useLocation();
  const { robot, missions, connectionState, error } = useOperations();
  const meta = routeMeta[location.pathname] ?? routeMeta["/"];
  const queuedCount = missions.filter(({ phase }) => phase === "QUEUED").length;

  useEffect(() => {
    document.title = meta.documentTitle;
    window.scrollTo({ top: 0 });
  }, [meta.documentTitle]);

  return (
    <div className="app-shell min-h-screen">
      <aside className="app-sidebar">
        <div className="brand-mark" aria-label="Cleany">
          <img src={logoUrl} alt="" aria-hidden="true" />
          <strong>Cleany</strong>
        </div>
        <nav className="primary-nav" aria-label="주요 메뉴">
          {navigation.map(({ path, label, Icon }) => (
            <NavLink
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              end={path === "/"}
              key={path}
              to={path}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-robot-status">로봇 1대 연결</span>
          <span className="sidebar-operator"><i>OP</i><strong>운영자</strong></span>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <h1>{meta.title}</h1>
          <section className="summary-grid" aria-label="관제 요약">
            <article className="summary-card robot-summary">
              <div className="summary-icon"><RobotIcon /></div>
              <div><span>로봇</span><strong>{robot?.robot_id ?? "cleany-01"}</strong></div>
            </article>
            <article className="summary-card">
              <div className="summary-icon"><FlagIcon /></div>
              <div><span>대기 Mission</span><strong>{queuedCount}</strong><small>대기 중인 요청이 없습니다.</small></div>
            </article>
            <article className="summary-card">
              <div className="summary-icon"><ClipboardIcon /></div>
              <div><span>활성 Mission</span><strong>{robot?.active_mission_id?.slice(0, 8) ?? "없음"}</strong><small>현재 진행 중인 Mission이 없습니다.</small></div>
            </article>
          </section>
          <div className="topbar-actions">
            <button className="icon-button" type="button" aria-label="알림"><BellIcon /></button>
            <span className="operator-avatar">OP</span><strong className="operator-name">운영자</strong><span aria-hidden="true">⌄</span>
          </div>
        </header>
        <span className="connection" data-state={connectionState} aria-live="polite">
          {error ? `API 연결 오류: ${error.message}` : connectionState === "connected" ? "LIVE" : "SSE 연결 중"}
        </span>
        <Outlet />
      </main>
    </div>
  );
}
