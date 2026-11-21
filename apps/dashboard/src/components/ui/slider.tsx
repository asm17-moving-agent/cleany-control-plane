import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Native range keeps keyboard, touch and assistive-technology behavior. */
export function Slider({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return <input type="range" data-slot="slider" className={cn("ui-slider", className)} {...props} />;
}
