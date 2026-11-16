import { Button } from "./ui/button";
import type { ReactNode } from "react";

export function WorkspaceMessage({ children, kind = "empty", onRetry }: {
  children: ReactNode; kind?: "empty" | "loading" | "error"; onRetry?: () => void;
}) {
  return <div className="workspace-empty" role={kind === "error" ? "alert" : kind === "loading" ? "status" : undefined}><p>{children}</p>{kind === "error" && onRetry && <Button onClick={onRetry}>다시 시도</Button>}</div>;
}
