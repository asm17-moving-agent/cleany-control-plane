import type { ReactNode } from "react";

export function WorkspaceMessage({ children, kind = "empty" }: {
  children: ReactNode; kind?: "empty" | "loading" | "error";
}) {
  return <p className="workspace-empty" role={kind === "error" ? "alert" : kind === "loading" ? "status" : undefined}>{children}</p>;
}
