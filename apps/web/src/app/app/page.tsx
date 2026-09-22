"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { InlineError, LoadingState } from "../../components/ui";
import { useMe, useSignedIn } from "../../lib/session";

export default function AppHome() {
  const ready = useSignedIn(); const me = useMe(ready); const router = useRouter();
  useEffect(() => {
    const orgs = me.data?.organizations.filter(o => o.status === "active");
    if (!orgs) return;
    let last = ""; try { last = localStorage.getItem("upstream.org") || ""; } catch { /* optional */ }
    const org = orgs.find(o => o.id === last) || orgs[0]; // last selection only redirects; it never authorizes
    router.replace(org ? `/app/${org.id}/investigations` : "/onboarding");
  }, [me.data, router]);
  return <main id="main-content" className="page-shell">{me.error ? <InlineError>{me.error.message}</InlineError> : <LoadingState label="Opening your workspace…"/>}</main>;
}
