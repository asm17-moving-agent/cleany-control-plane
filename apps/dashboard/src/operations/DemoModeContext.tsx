import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { useSearchParams } from "react-router";

const storageKey = "cleany.operations-demo";
const DemoModeContext = createContext({ isDemo: false, isRecording: false, setDemoMode: (_enabled: boolean) => {} });

export function DemoModeProvider({ children }: PropsWithChildren) {
  const [params, setParams] = useSearchParams();
  const [enabled, setEnabled] = useState(() => sessionStorage.getItem(storageKey) === "1");
  const explicit = params.get("demo");
  const [recording, setRecording] = useState(() => sessionStorage.getItem("cleany.recording") === "1");
  const isRecording = params.get("recording") === "1" || (params.get("recording") !== "0" && explicit !== "0" && recording);
  const isDemo = isRecording || explicit === "1" || (explicit !== "0" && enabled);
  useEffect(() => {
    setRecording(isRecording);
    if (isRecording) sessionStorage.setItem("cleany.recording", "1");
    else sessionStorage.removeItem("cleany.recording");
  }, [isRecording]);

  useEffect(() => {
    setEnabled(isDemo);
    if (isDemo) sessionStorage.setItem(storageKey, "1");
    else sessionStorage.removeItem(storageKey);
  }, [isDemo]);

  function setDemoMode(next: boolean) {
    setRecording(false);
    sessionStorage.removeItem("cleany.recording");
    setEnabled(next);
    setParams(current => {
      const updated = new URLSearchParams(current);
      updated.set("demo", next ? "1" : "0");
      updated.delete("recording");
      updated.delete("mission");
      updated.delete("robot");
      return updated;
    }, { replace: true });
  }

  return <DemoModeContext.Provider value={{ isDemo, isRecording, setDemoMode }}>{children}</DemoModeContext.Provider>;
}

export const useDemoMode = () => useContext(DemoModeContext);
