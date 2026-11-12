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

/** Browser-local preferences; liveStatus and completionNotification are stored but not consumed yet. */
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

/** Merge saved values with defaults; read/parse failures fall back without validating stored fields. */
function readSettings(): DashboardSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<DashboardSettings>;
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Shares preferences initialized from localStorage, with no backend or cross-tab synchronization.
 * Saving writes storage before publishing React state; storage write errors reach the caller.
 */
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
