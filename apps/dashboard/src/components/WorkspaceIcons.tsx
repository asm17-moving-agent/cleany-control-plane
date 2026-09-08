import type { SVGProps } from "react";
type Props = SVGProps<SVGSVGElement>;
export function ChevronIcon(props: Props) { return <svg viewBox="0 0 24 24" {...props}><path d="m9 5 7 7-7 7" /></svg>; }
export function CloseIcon(props: Props) { return <svg viewBox="0 0 24 24" {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>; }
export function EyeIcon(props: Props) { return <svg viewBox="0 0 24 24" {...props}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>; }
export function ShieldIcon(props: Props) { return <svg viewBox="0 0 24 24" {...props}><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" /><path d="M12 8v5m0 3h.01" /></svg>; }
export function CheckIcon(props: Props) { return <svg viewBox="0 0 24 24" {...props}><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></svg>; }
export function BatteryIcon(props: Props) { return <svg viewBox="0 0 24 24" {...props}><rect x="2" y="7" width="17" height="10" rx="2" /><path d="M22 10v4M6 12h9" /></svg>; }
export function TargetIcon(props: Props) { return <svg viewBox="0 0 24 24" {...props}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>; }
