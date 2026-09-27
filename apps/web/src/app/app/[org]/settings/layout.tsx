"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DocIcon, LinkIcon, PeopleIcon, PersonIcon, StationIcon } from "../../../../components/icons";
import { useOrg } from "../../../../lib/session";

const SECTIONS: [string, string, (p: { size?: number }) => ReactNode][] = [["profile", "Profile", PersonIcon], ["organization", "Organization", PeopleIcon], ["instruments", "Instruments", StationIcon], ["protocols", "Protocols", DocIcon], ["integrations", "Integrations", LinkIcon]];

/** Settings share one side navigation; each page keeps its own permission and empty states. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { org } = useOrg(); const pathname = usePathname();
  return <div className="settings-shell">
    <nav className="side-nav settings-nav" aria-label="Settings"><p className="side-heading">Settings</p>
      {SECTIONS.map(([path, label, Icon]) => { const href = `/app/${org}/settings/${path}`; return <Link key={path} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={22}/>{label}</Link>; })}</nav>
    <div className="settings-content">{children}</div>
  </div>;
}
