import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "overview" | "incidents" | "pipelines" | "quality" | "datasets" | "lineage" | "connectors" | "settings"
  | "search" | "plus" | "close" | "check" | "chevronDown" | "chevronRight" | "chevronLeft" | "chevronsLeft"
  | "arrowRight" | "arrowUpRight" | "externalLink" | "refresh" | "download" | "upload" | "filter" | "sliders"
  | "more" | "menu" | "command" | "bell" | "sun" | "moon" | "monitor" | "logout" | "user" | "users" | "clock"
  | "play" | "copy" | "eye" | "eyeOff" | "lock" | "shield" | "activity" | "barChart" | "trendUp" | "trendDown"
  | "database" | "layers" | "fileText" | "box" | "server" | "alertCircle" | "alertTriangle" | "info"
  | "checkCircle" | "xCircle" | "sparkles" | "wand" | "terminal" | "key" | "mail" | "hash" | "link" | "zap"
  | "rocket" | "circleDot" | "list" | "panelLeft" | "maximize" | "gitBranch" | "gauge" | "pieChart" | "calendar"
  | "history" | "cpu" | "globe" | "building" | "fingerprint" | "keyboard" | "workflow" | "pulse" | "target"
  | "stop" | "trash" | "edit" | "filterX" | "sortAsc" | "sortDesc" | "inbox" | "tag" | "bookOpen" | "wifi";

const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/></>,
  incidents: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  pipelines: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M10 6.5h3.5a2.5 2.5 0 0 1 2.5 2.5v5M14 17.5h-3.5A2.5 2.5 0 0 1 8 15V9.5"/></>,
  quality: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/></>,
  datasets: <><ellipse cx="12" cy="5.5" rx="8.5" ry="3"/><path d="M3.5 5.5v6.5c0 1.66 3.8 3 8.5 3s8.5-1.34 8.5-3V5.5"/><path d="M3.5 12v6c0 1.66 3.8 3 8.5 3s8.5-1.34 8.5-3v-6"/></>,
  lineage: <><circle cx="12" cy="18" r="2.6"/><circle cx="6" cy="6" r="2.6"/><circle cx="18" cy="6" r="2.6"/><path d="M18 8.6v.9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-.9M12 11.5v3.9"/></>,
  connectors: <><path d="M9 7V3M15 7V3"/><path d="M7 7h10v4.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z"/><path d="M12 16.5V21"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.35-4.35"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7"/></>,
  chevronDown: <><path d="m6 9 6 6 6-6"/></>,
  chevronRight: <><path d="m9 18 6-6-6-6"/></>,
  chevronLeft: <><path d="m15 18-6-6 6-6"/></>,
  chevronsLeft: <><path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/></>,
  arrowRight: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  arrowUpRight: <><path d="M7 17 17 7M8 7h9v9"/></>,
  externalLink: <><path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
  refresh: <><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M3 16v-4h4M21 8V4h-4"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/></>,
  filter: <><path d="M22 3H2l8 9.46V19l4 2v-8.54Z"/></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></>,
  more: <><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  command: <><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
  moon: <><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></>,
  user: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  play: <><path d="M6 3.5 20 12 6 20.5Z"/></>,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/></>,
  lock: <><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/></>,
  activity: <><path d="M22 12h-3.5l-2.5 7-4-14-2.5 7H2"/></>,
  barChart: <><path d="M6 20v-5M12 20V4M18 20v-9"/></>,
  trendUp: <><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></>,
  trendDown: <><path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></>,
  layers: <><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.57 3.9a2 2 0 0 0 1.66 0l8.57-3.9a1 1 0 0 0 0-1.83Z"/><path d="m2 12.5 8.57 3.9a2 2 0 0 0 1.66 0L22 12.5M2 17l8.57 3.9a2 2 0 0 0 1.66 0L22 17"/></>,
  fileText: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8"/></>,
  box: <><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/></>,
  server: <><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></>,
  alertCircle: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></>,
  alertTriangle: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></>,
  checkCircle: <><path d="M21.8 11.1A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/></>,
  xCircle: <><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></>,
  sparkles: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 3v4M21 5h-4M5 17v3M6.5 18.5h-3"/></>,
  wand: <><path d="M15 4V2M15 10V8M8 5h2M20 5h2"/><path d="m3 21 9-9"/><path d="m14.5 6.5 3 3"/><path d="M11 7H9M17 5h-2"/></>,
  terminal: <><path d="m4 17 6-6-6-6M12 19h8"/></>,
  key: <><path d="M2.6 17.4A2 2 0 0 0 2 18.8V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.2a2 2 0 0 0 1.4-.6l.8-.8a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".6" fill="currentColor" stroke="none"/></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></>,
  hash: <><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  zap: <><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></>,
  rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></>,
  circleDot: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
  panelLeft: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>,
  maximize: <><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></>,
  gitBranch: <><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
  gauge: <><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></>,
  pieChart: <><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10Z"/></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4.5l3 1.5"/></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/></>,
  building: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 22v-4h4v4"/></>,
  fingerprint: <><path d="M2 12a10 10 0 0 1 18-6"/><path d="M5 19.5A10 10 0 0 1 4 14a8 8 0 0 1 16 0v1"/><path d="M8.5 20a14 14 0 0 1-1-7 4.5 4.5 0 0 1 9 0v1.5"/><path d="M12 21.5V16a1 1 0 0 1 2 0v4.5"/></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/></>,
  workflow: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M10 6.5h4a2 2 0 0 1 2 2v5.5M10 17.5h-2a2 2 0 0 1-2-2V9.5"/></>,
  pulse: <><path d="M3 12h4l2.5-6 4 12L16 12h5"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="2"/></>,
  trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></>,
  edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></>,
  filterX: <><path d="M13.01 3H2l8 9.46V19l4 2v-8.54"/><path d="m17 8 5 5M22 8l-5 5"/></>,
  sortAsc: <><path d="M11 12h4M11 16h7M11 8h2M4 16l3 3 3-3M7 19V5"/></>,
  sortDesc: <><path d="M11 12h4M11 16h7M11 8h2M4 8l3-3 3 3M7 5v14"/></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></>,
  tag: <><path d="M12.59 2H4a2 2 0 0 0-2 2v8.59a2 2 0 0 0 .59 1.41l7.41 7.41a2 2 0 0 0 2.83 0l8.58-8.58a2 2 0 0 0 0-2.83L13.99 2.6A2 2 0 0 0 12.59 2Z"/><path d="M7 7h.01"/></>,
  bookOpen: <><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a3 3 0 0 1 3 3 3 3 0 0 1 3-3h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z"/></>,
  wifi: <><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></>,
};

export type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number; strokeWidth?: number };

export function Icon({ name, size = 16, strokeWidth = 1.7, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
