import type { ReactNode } from "react";
import { Link } from "react-router";
import type { Mission } from "../api/types";
import { outcomeLabels } from "../lib/home-summary";
import { missionTone } from "../lib/operations";
import { panelMotionStyle } from "./panel-motion";
import "./operations-page.css";

export function OperationsPage({ title, description, action, children, className = "" }: {
  title: string; description: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`ops-page ${className}`} style={panelMotionStyle}>
    <header className="ops-page-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</header>
    {children}
  </section>;
}

export function OperationsTabs({ label, tabs }: {
  label: string; tabs: { label: string; href: string; count: number | string; active: boolean; attention?: boolean }[];
}) {
  return <nav className="ops-tabs" aria-label={label}>{tabs.map(tab => <Link key={tab.href} to={tab.href}
    aria-current={tab.active ? "page" : undefined} data-attention={tab.attention || undefined}>
    {tab.label}<span>{tab.count}</span>
  </Link>)}</nav>;
}

const phaseLabels = { QUEUED: "대기", OFFERED: "배정 확인 중", ACCEPTED: "작업 준비", NAVIGATING: "이동 중", WORKING: "작업 중", RETURNING: "복귀 중", TERMINAL: "종료" };
export function MissionStatusBadge({ mission }: { mission: Mission }) {
  return <span className="ops-status" data-tone={missionTone(mission)}>
    {mission.phase === "TERMINAL" && mission.outcome ? outcomeLabels[mission.outcome] : mission.cancel_requested ? "취소 요청 중" : phaseLabels[mission.phase]}
  </span>;
}

export function OperationsEmpty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="ops-empty" role="status"><span className="ops-empty-icon" aria-hidden="true">{icon}</span><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
