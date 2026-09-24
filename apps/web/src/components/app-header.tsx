"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, supabase } from "../lib/api";
import { useMe } from "../lib/session";
import { Brand } from "./brand";
import { DuskScene } from "./scene/dusk-scene";

type Note = { read_at: string | null };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join("") || "U";

/** Public and workspace header. The workspace variant carries the account menu (settings, sign out) and the bell.
 *  `scene={false}` when the page renders its own DuskScene (landing, pages with a scene route). */
export function AppHeader({ org, scene = true }: { org?: string; scene?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { if (!org) supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session)); }, [org]);
  const me = useMe(!!org || signedIn);
  const membership = me.data?.organizations.find(o => o.id === org);
  const can = (c: string) => !!membership?.capabilities.includes(c);
  const base = org ? `/app/${encodeURIComponent(org)}` : "";
  const links: [string, string][] = org
    ? [["Investigations", `${base}/investigations`], ["Field tasks", `${base}/tasks`], ...(can("expert") || can("coordinate") || can("evidence_view") ? [["Evidence review", `${base}/evidence`] as [string, string]] : []), ["Community", `${base}/community`]]
    : [["How it works", "/how-it-works"], ["Investigations", "/example"], ["For communities", "/how-it-works#communities"]];
  const active = (href: string) => pathname === href || (!!org && pathname.startsWith(href)) || (!org && href === "/example" && pathname.startsWith("/example"));
  return <>{!scene || pathname === "/" ? null : <DuskScene variant={org ? "band" : "screen"}/>}
    <header className="app-header"><div className="header-inner"><Brand/>{membership?.example ? <span className="workspace-origin" title="Every record in this workspace is synthetic">Example workspace</span> : null}
      <button className="menu-toggle button button-outline" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}>{open ? "Close menu" : "Menu"}</button>
      <nav id="primary-navigation" aria-label="Primary" className={open ? "primary-nav is-open" : "primary-nav"}>
        {links.map(([label, href]) => <Link key={href} href={href} className={active(href) ? "active" : undefined} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}
        {!org && !signedIn ? <Link href="/sign-in" className={pathname === "/sign-in" ? "active nav-sign-in" : "nav-sign-in"} aria-current={pathname === "/sign-in" ? "page" : undefined}>Sign in</Link> : null}
      </nav>
      {org ? <div className="header-tools"><Bell org={org}/><span className="header-divider" aria-hidden="true"/>
        <AccountMenu name={me.data?.profile?.display_name ?? ""} orgName={membership?.name} org={org} admin={can("admin")}/></div>
        : signedIn ? <div className="header-tools"><AccountMenu name={me.data?.profile?.display_name ?? ""} org={me.data?.organizations.find(o => o.status === "active")?.id}/></div> : null}
    </div></header></>;
}

function Bell({ org }: { org: string }) {
  const notes = useQuery({ queryKey: ["notifications", org], queryFn: () => api<Note[]>(`/orgs/${org}/notifications`), staleTime: 60_000 });
  const unread = notes.data?.filter(n => !n.read_at).length ?? 0;
  return <Link href={`/app/${org}/notifications`} className="icon-button bell" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    {unread ? <span className="unread" aria-hidden="true"/> : null}</Link>;
}

function AccountMenu({ name, orgName, org, admin }: { name: string; orgName?: string; org?: string; admin?: boolean }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => { if (menu.current) menu.current.open = false; }, [pathname]);
  useEffect(() => { // light dismiss: outside click or Escape closes, focus returns to the trigger
    const close = (e: Event) => { const m = menu.current; if (m?.open && (e instanceof KeyboardEvent ? e.key === "Escape" : !m.contains(e.target as Node))) { m.open = false; if (e instanceof KeyboardEvent) m.querySelector("summary")?.focus(); } };
    document.addEventListener("click", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  const settings: [string, string][] = org ? [["Profile", "settings/profile"], ["Organization", "settings/organization"], ["Instruments", "settings/instruments"], ["Protocols", "settings/protocols"], ["Integrations", "settings/integrations"]] : [];
  return <details className="account-menu" ref={menu}><summary aria-label={`Account${name ? `: ${name}` : ""}`}><span className="avatar" aria-hidden="true">{initials(name)}</span></summary>
    <div className="menu-panel">
      <p className="menu-meta"><strong>{name || "Signed in"}</strong>{orgName ? <><br/>{orgName}{admin ? " · administrator" : ""}</> : null}</p>
      <Link href="/report/new">Report an observation</Link>
      {org ? <Link href={`/app/${org}/investigations`}>Workspace</Link> : null}
      {org ? <Link href={`/app/${org}/notifications`}>Notifications</Link> : null}
      {settings.map(([label, path]) => <Link key={path} href={`/app/${org}/${path}`}>{label}</Link>)}
      <button type="button" onClick={() => supabase.auth.signOut().then(() => { location.href = "/"; })}>Sign out</button>
    </div></details>;
}
