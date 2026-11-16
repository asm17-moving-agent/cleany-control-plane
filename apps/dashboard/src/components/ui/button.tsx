// Adapted from shadcn/ui; upstream source hashes are in registry-provenance.json.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";
export const buttonVariants = cva("ui-button", {
  variants: {
    variant: { primary: "ui-button-primary", secondary: "ui-button-secondary", ghost: "ui-button-ghost", "danger-outline": "ui-button-danger-outline", danger: "ui-button-danger" },
    size: { default: "ui-control-default", compact: "ui-control-compact", large: "ui-control-large", icon: "ui-control-default ui-button-icon", "icon-compact": "ui-control-compact ui-button-icon" },
  }, defaultVariants: { variant: "secondary", size: "default" },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
