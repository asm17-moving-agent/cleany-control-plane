import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { Priority } from "../api/types";

const STORAGE_KEY = "cleany.dashboard.settings";

export interface DashboardSettings {
  refreshSeconds: "5" | "10" | "30";
  liveStatus: boolean;
  defaultPriority: Priority;
  completionNotification: boolean;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  refreshSeconds: "10",
  liveStatus: true,
  defaultPriority: "NORMAL",
  completionNotification: true,
};

interface SettingsContextValue {
  settings: DashboardSettings;
  saveSettings: (settings: DashboardSettings) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readSettings(): DashboardSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<DashboardSettings>;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState(readSettings);
  const saveSettings = useCallback((next: DashboardSettings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSettings(next);
  }, []);
  const value = useMemo(() => ({ settings, saveSettings }), [saveSettings, settings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
