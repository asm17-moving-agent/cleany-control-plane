import type { ReactNode } from "react";

/** A definition-list row; the enclosing dl owns its page-specific layout. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}
