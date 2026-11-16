import { lazy, Suspense } from "react";
const UiPreviewPage = import.meta.env.DEV ? lazy(() => import("../pages/UiPreviewPage").then(module => ({ default: module.UiPreviewPage }))) : () => null;
import { Navigate, Route, Routes, useLocation } from "react-router";
import { MapPage } from "../pages/MapPage";
const MonitoringPage = lazy(() => import("../pages/MonitoringPage").then(module => ({ default: module.MonitoringPage })));
import { MissionsPage } from "../pages/MissionsPage";
import { RobotsPage } from "../pages/RobotsPage";
import { RobotModelPage } from "../pages/RobotModelPage";
import { ResultsPage } from "../pages/ResultsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { AppShell } from "./AppShell";

export function App() {
  return (
    <Routes>
      {import.meta.env.DEV && <Route path="ui-preview" element={<Suspense fallback={null}><UiPreviewPage /></Suspense>} />}
      {import.meta.env.DEV && <Route path="robot-model" element={<RobotModelPage />} />}
      <Route element={<AppShell />}>
        <Route index element={<HomeEntry />} />
        <Route path="map" element={<MapPage />} />
        <Route path="missions" element={<MissionsPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="monitoring" element={<LegacyMonitoring />} />
        <Route path="robots" element={<RobotsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}

function HomeEntry() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  if (params.get("recording") === "1" || params.get("summaryDemo") === "1") return <Navigate replace to={{ pathname: "/map", search: location.search, hash: location.hash }} />;
  return <Suspense fallback={<p role="status">운영 현황 불러오는 중</p>}><MonitoringPage /></Suspense>;
}
function LegacyMonitoring() {
  const location = useLocation();
  return <Navigate replace to={{ pathname: "/", search: location.search, hash: location.hash }} />;
}
