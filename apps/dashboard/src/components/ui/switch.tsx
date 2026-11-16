// shadcn/ui composition with Cleany's shared sizing and colors.
import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return <SwitchPrimitive.Root data-slot="switch" className={cn("ui-switch", className)} {...props}><SwitchPrimitive.Thumb data-slot="switch-thumb" /></SwitchPrimitive.Root>;
}
