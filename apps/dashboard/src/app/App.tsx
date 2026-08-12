import { Navigate, Route, Routes } from "react-router";
import { HomePage } from "../pages/HomePage";
import { MissionsPage } from "../pages/MissionsPage";
import { MonitoringPage } from "../pages/MonitoringPage";
import { RobotsPage } from "../pages/RobotsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { AppShell } from "./AppShell";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="missions" element={<MissionsPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="robots" element={<RobotsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
