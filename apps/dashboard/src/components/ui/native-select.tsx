// Native DOM is intentional: preserve forms, labels and mobile browser selection.
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function NativeSelect({ className, controlSize = "default", ...props }: ComponentProps<"select"> & { controlSize?: "default" | "compact" | "large" }) {
  return <select data-slot="native-select" className={cn("ui-input", `ui-control-${controlSize}`, className)} {...props} />;
}
export function NativeSelectOption(props: ComponentProps<"option">) { return <option {...props} />; }
export function NativeSelectOptGroup(props: ComponentProps<"optgroup">) { return <optgroup {...props} />; }
