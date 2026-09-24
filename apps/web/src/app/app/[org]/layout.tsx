"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppHeader } from "../../../components/app-header";
import { OfflineStatus } from "../../../components/offline";
import { EmptyState, PageState } from "../../../components/ui";
import { useMe, useSignedIn } from "../../../lib/session";

export default function OrgLayout({ children }: { children: ReactNode }) {
  const { org } = useParams<{ org: string }>();
  const ready = useSignedIn(); const me = useMe(ready);
  const membership = me.data?.organizations.find(o => o.id === org && o.status === "active");
  useEffect(() => { if (membership) try { localStorage.setItem("upstream.org", org); } catch { /* optional */ } }, [membership, org]);
  let body: ReactNode = children;
  if (me.error) body = <PageState title="Workspace" error={me.error} retry={() => me.refetch()}/>;
  else if (!me.data) body = <PageState title="Workspace"/>;
  else if (!membership) body = <main id="main-content" className="page-shell"><EmptyState title="This workspace is not available to you" steps={["You may not be a member of this organization, or your membership has ended.", "An organization administrator can invite you again."]} action={<Link className="button button-outline" href="/app">Go to your workspace</Link>}/></main>;
  return <><OfflineStatus/><AppHeader org={org}/>{body}</>;
}
