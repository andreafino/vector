import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

const base = (size: number): CSSProperties => ({ width: size, height: size, display: "block" });

export function ToolsIcon({ size = 22, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.3 2.3-2-2z" />
    </svg>
  );
}

export function CursorIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3l6 17 2.2-6.8L20 11 5 3z" />
    </svg>
  );
}

export function AddEntityIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="12" height="9" rx="1.5" />
      <path d="M19 15v6M16 18h6" />
    </svg>
  );
}

export function EntityIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
    </svg>
  );
}

export function ContainerIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" strokeDasharray="3 2.5" />
    </svg>
  );
}

export function ConnectIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="6" r="2.4" />
      <circle cx="19" cy="18" r="2.4" />
      <path d="M7 7.5 17 16.5" />
    </svg>
  );
}

export function DeleteIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4.8c0-.4.3-.8.8-.8h4.4c.5 0 .8.4.8.8V7M6 7l1 12.2c0 .9.7 1.8 1.7 1.8h6.6c1 0 1.7-.9 1.7-1.8L18 7" />
    </svg>
  );
}

export function UndoIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 8H4V5" />
      <path d="M4 8a8 8 0 1 1-1.8 7.2" />
    </svg>
  );
}

export function RedoIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 8h3V5" />
      <path d="M20 8a8 8 0 1 0 1.8 7.2" />
    </svg>
  );
}

export function HistoryIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l3 2" />
      <path d="M9 2h6" />
    </svg>
  );
}

export function ActivityIcon({ size = 22, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export function ChatIcon({ size = 22, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function TeamIcon({ size = 22, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function OpenFileIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H5" />
      <path d="M3 8l1.5 11a2 2 0 0 0 2 1.8h11a2 2 0 0 0 2-1.8L21 10H5a2 2 0 0 0-2 2z" />
    </svg>
  );
}

export function SaveFileIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3h11l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M8 3v6h8V3" />
      <path d="M7 14h10v7H7z" />
    </svg>
  );
}

export function NewFileIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M13 3v5h5" />
      <path d="M12 12v6M9 15h6" />
    </svg>
  );
}

export function PrinterIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V4h12v5" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M8 13h8v7H8z" />
    </svg>
  );
}

// Anello che ruota (via keyframes "eosSpin" in index.css), usato al posto dell'icona statica mentre
// l'export PDF è in corso.
export function SpinnerIcon({ size = 20, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style, animation: "eosSpin 0.8s linear infinite" }} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export function SunIcon({ size = 16, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8" />
    </svg>
  );
}

export function MoonIcon({ size = 16, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export function SearchIcon({ size = 16, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 14, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 14, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CollapseSidebarIcon({ size = 18, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5 9 12l6 7" />
    </svg>
  );
}

export function ExpandSidebarIcon({ size = 18, style }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" style={{ ...base(size), ...style }} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l6 7-6 7" />
    </svg>
  );
}
