import { lazy, Suspense } from "react";
const UiPreviewPage = import.meta.env.DEV ? lazy(() => import("../pages/UiPreviewPage").then(module => ({ default: module.UiPreviewPage }))) : () => null;
import { Navigate, Route, Routes } from "react-router";
import { HomePage } from "../pages/HomePage";
import { MissionsPage } from "../pages/MissionsPage";
import { MonitoringPage } from "../pages/MonitoringPage";
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
        <Route index element={<HomePage />} />
        <Route path="missions" element={<MissionsPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="robots" element={<RobotsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
