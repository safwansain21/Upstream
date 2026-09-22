import type { ReactNode } from "react";

export function RiverDivider({ className = "", fill = "currentColor" }: { className?: string; fill?: string }) {
  return <svg className={`river-divider ${className}`} viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path fill={fill} d="M0 31C196-17 308 13 473 37C646 61 697 14 847 25C1035 37 1070 92 1240 47C1325 26 1380 15 1440 22V70H0Z"/></svg>;
}
export function RiverPanel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <aside className={`river-panel ${className}`}>{children}</aside>;
}
export function AtlasMapFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`atlas-map-frame ${className}`}>{children}</div>;
}
export function EvidenceFlowLine() {
  return <svg className="evidence-flow-line" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 35C100-20 230 90 350 35S560 0 660 35S820 75 910 35S1110 0 1200 35" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
}
export function RiverPhotoMask({ children }: { children: ReactNode }) {
  return <div className="river-photo-mask">{children}</div>;
}
