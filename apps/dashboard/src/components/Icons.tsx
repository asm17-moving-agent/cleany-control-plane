import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function HomeIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><path d="m3 11 9-7 9 7v9h-6v-6H9v6H3z" /></svg>;
}

export function MissionIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M9 6V4h6v2M8 12h8" /></svg>;
}

export function MonitoringIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="m7 14 3-3 2 2 5-5M9 21h6M12 17v4" /></svg>;
}

export function RobotIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><rect x="5" y="8" width="14" height="11" rx="5" /><path d="M12 4v4M9 13h.01M15 13h.01M8 19v2h8v-2" /></svg>;
}

export function SettingsIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3.1V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
}

export function FlagIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><path d="M6 22V3M7 5h11l-2 4 2 4H7" /></svg>;
}

export function ClipboardIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3h6v2M9 11h6M9 15h6" /></svg>;
}

export function BellIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}

export function MapPinIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}

export function SendIcon(props: IconProps) {
  return <svg viewBox="0 0 24 24" {...props}><path d="m21 3-8 18-3-7-7-3zM10 14l4-4" /></svg>;
}

export function RobotLargeIcon(props: IconProps) {
  return <svg viewBox="0 0 32 32" {...props}><rect x="5" y="9" width="22" height="16" rx="7" /><path d="M16 5v4M11 17h.01M21 17h.01M9 25v2h14v-2" /></svg>;
}
