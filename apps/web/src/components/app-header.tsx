"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brand } from "./brand";

export function AppHeader({ org }: { org?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const base = org ? `/app/${encodeURIComponent(org)}` : "";
  const links = org ? [["Investigations", `${base}/investigations`], ["My tasks", `${base}/tasks`], ["Evidence", `${base}/evidence`], ["Community", `${base}/community`]] : [["How it works", "/how-it-works"], ["Explore", "/example"], ["For communities", "/how-it-works#communities"]];
  return <header className="app-header"><div className="header-inner"><Brand /><button className="menu-toggle button button-outline" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button><nav id="primary-navigation" aria-label="Primary" className={open ? "primary-nav is-open" : "primary-nav"}>{links.map(([label, href]) => <Link key={href} href={href} className={pathname === href || (org && pathname.startsWith(href)) ? "active" : undefined} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}</nav><Link className={`header-action button ${org ? "button-primary" : "button-outline"}`} href={org ? "/report/new" : "/sign-in"}>{org ? "+ New observation" : "Sign in"}</Link></div><svg className="header-wave" viewBox="0 0 1440 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 1C130 42 233 5 390 9S640 30 811 12S1053 8 1219 15S1366 21 1440 1V0H0Z" fill="var(--canvas)" stroke="var(--ice)" strokeWidth="1.5"/></svg></header>;
}
