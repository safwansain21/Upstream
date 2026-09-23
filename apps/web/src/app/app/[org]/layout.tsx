"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppHeader } from "../../../components/app-header";
import { OfflineStatus } from "../../../components/offline";
import { EmptyState, PageState } from "../../../components/ui";
import { supabase } from "../../../lib/api";
import { useMe, useSignedIn } from "../../../lib/session";

export default function OrgLayout({ children }: { children: ReactNode }) {
  const { org } = useParams<{ org: string }>();
  const ready = useSignedIn(); const me = useMe(ready);
  const membership = me.data?.organizations.find(o => o.id === org && o.status === "active");
  useEffect(() => { if (membership) try { localStorage.setItem("upstream.org", org); } catch { /* optional */ } }, [membership, org]);
  let body: ReactNode = children;
  if (me.error) body = <PageState title="Workspace" error={me.error} retry={() => me.refetch()}/>;
  else if (!me.data) body = <PageState title="Workspace"/>;
  else if (!membership) body = <main id="main-content" className="page-shell"><EmptyState title="This workspace is not available to you" action={<Link className="button button-outline" href="/app">Go to your workspace</Link>}><p>You may not be a member of this organization, or your membership has ended.</p></EmptyState></main>;
  const links: [string, string][] = [["notifications", "Notifications"], ["settings/profile", "Profile"], ["settings/organization", "Organization"],
    ["settings/instruments", "Instruments"], ["settings/protocols", "Protocols"], ["settings/integrations", "Integrations"]];
  return <><OfflineStatus/><AppHeader org={org}/>
    {membership ? <nav className="workspace-nav" aria-label="Workspace"><strong>{membership.name}</strong>{links.map(([path, label]) => <Link key={path} href={`/app/${org}/${path}`}>{label}</Link>)}
      <button className="button button-quiet" onClick={() => supabase.auth.signOut().then(() => { location.href = "/"; })}>Sign out</button></nav> : null}
    {membership?.example ? <div className="page-banner" role="note">Example workspace · synthetic data</div> : null}{body}</>;
}
