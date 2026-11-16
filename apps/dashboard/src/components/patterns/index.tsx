import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
export type Tone = "neutral" | "info" | "success" | "waiting" | "warning" | "danger";
export function Surface({ variant = "panel", className, ...props }: ComponentProps<"section"> & { variant?: "panel" | "floating" | "inset" | "attached" }) { return <section className={cn("ui-surface", `ui-surface-${variant}`, className)} {...props} />; }
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <header className="ui-page-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>; }
export function PanelHeader({ title, description, icon, action, className }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return <header className={cn("ui-panel-header", className)}>{icon}<div><h3>{title}</h3>{description && <p>{description}</p>}</div>{action}</header>;
}
export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor: string; hint?: string; children: ReactNode; className?: string }) { return <div className={cn("ui-field", className)}><label htmlFor={htmlFor}>{label}</label>{children}{hint && <small id={`${htmlFor}-hint`}>{hint}</small>}</div>; }
export function StatusBadge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) { return <span className={cn("ui-status", className)} data-tone={tone} {...props} />; }
export function Notice({ tone = "neutral", className, ...props }: ComponentProps<"p"> & { tone?: Tone }) { return <p className={cn("ui-notice", className)} data-tone={tone} {...props} />; }
