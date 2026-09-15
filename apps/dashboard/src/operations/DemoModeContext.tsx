import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { useSearchParams } from "react-router";

const storageKey = "cleany.operations-demo";
const DemoModeContext = createContext({ isDemo: false, setDemoMode: (_enabled: boolean) => {} });

export function DemoModeProvider({ children }: PropsWithChildren) {
  const [params, setParams] = useSearchParams();
  const [enabled, setEnabled] = useState(() => sessionStorage.getItem(storageKey) === "1");
  const explicit = params.get("demo");
  const isDemo = explicit === "1" || (explicit !== "0" && enabled);

  useEffect(() => {
    setEnabled(isDemo);
    if (isDemo) sessionStorage.setItem(storageKey, "1");
    else sessionStorage.removeItem(storageKey);
  }, [isDemo]);

  function setDemoMode(next: boolean) {
    setEnabled(next);
    setParams(current => {
      const updated = new URLSearchParams(current);
      updated.set("demo", next ? "1" : "0");
      updated.delete("mission");
      updated.delete("robot");
      return updated;
    }, { replace: true });
  }

  return <DemoModeContext.Provider value={{ isDemo, setDemoMode }}>{children}</DemoModeContext.Provider>;
}

export const useDemoMode = () => useContext(DemoModeContext);
