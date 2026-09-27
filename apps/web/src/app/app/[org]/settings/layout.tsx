"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOrg } from "../../../../lib/session";

const SECTIONS: [string, string][] = [["profile", "Profile"], ["organization", "Organization"], ["instruments", "Instruments"], ["protocols", "Protocols"], ["integrations", "Integrations"]];

/** Settings share one side navigation; each page keeps its own permission and empty states. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { org } = useOrg(); const pathname = usePathname();
  return <div className="settings-shell">
    <nav className="side-nav settings-nav" aria-label="Settings"><p className="side-heading">Settings</p>
      {SECTIONS.map(([path, label]) => { const href = `/app/${org}/settings/${path}`; return <Link key={path} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>; })}</nav>
    <div className="settings-content">{children}</div>
  </div>;
}
