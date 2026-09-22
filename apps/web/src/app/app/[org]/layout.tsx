"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppHeader } from "../../../components/app-header";
import { EmptyState, InlineError, LoadingState } from "../../../components/ui";
import { supabase } from "../../../lib/api";
import { useMe, useSignedIn } from "../../../lib/session";

export default function OrgLayout({ children }: { children: ReactNode }) {
  const { org } = useParams<{ org: string }>();
  const ready = useSignedIn(); const me = useMe(ready);
  const membership = me.data?.organizations.find(o => o.id === org && o.status === "active");
  useEffect(() => { if (membership) try { localStorage.setItem("upstream.org", org); } catch { /* optional */ } }, [membership, org]);
  let body: ReactNode = children;
  if (me.error) body = <main id="main-content" className="page-shell"><InlineError>{me.error.message}</InlineError></main>;
  else if (!me.data) body = <main id="main-content" className="page-shell"><LoadingState/></main>;
  else if (!membership) body = <main id="main-content" className="page-shell"><EmptyState title="This workspace is not available to you" action={<Link className="button button-outline" href="/app">Go to your workspace</Link>}><p>You may not be a member of this organization, or your membership has ended.</p></EmptyState></main>;
  const links: [string, string][] = [["notifications", "Notifications"], ["settings/profile", "Profile"], ["settings/organization", "Organization"],
    ["settings/instruments", "Instruments"], ["settings/protocols", "Protocols"], ["settings/integrations", "Integrations"]];
  return <><AppHeader org={org}/>
    {membership ? <nav className="breadcrumbs" aria-label="Workspace">{membership.name} · {links.map(([path, label]) => <span key={path}><Link href={`/app/${org}/${path}`}>{label}</Link> · </span>)}
      <button className="button button-quiet" onClick={() => supabase.auth.signOut().then(() => { location.href = "/"; })}>Sign out</button></nav> : null}
    {membership?.example ? <div className="page-banner" role="note">Example workspace · synthetic data</div> : null}{body}</>;
}
