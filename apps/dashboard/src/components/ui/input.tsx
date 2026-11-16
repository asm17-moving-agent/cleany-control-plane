// Native input contract retained from shadcn/ui.
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Input({ className, controlSize = "default", ...props }: ComponentProps<"input"> & { controlSize?: "default" | "compact" | "large" }) {
  return <input data-slot="input" className={cn("ui-input", `ui-control-${controlSize}`, className)} {...props} />;
}
