"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "../../../components/app-header";
import { InlineError, LoadingState } from "../../../components/ui";
import { db, newDraft } from "../../../lib/drafts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewReport() {
  const router = useRouter(); const [error, setError] = useState("");
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("org") || "";
    const org = UUID.test(requested) ? requested : process.env.NEXT_PUBLIC_INTAKE_ORG_ID || "";
    if (!org) { setError("Report intake is not configured for this deployment."); return; }
    const draft = newDraft(org);
    db.drafts.put(draft).then(() => router.replace(`/report/${draft.id}/edit`),
      () => setError("This browser cannot store drafts (private mode or storage full). Reporting needs device storage in this version."));
  }, [router]);
  return <><AppHeader/><main id="main-content" className="page-shell">{error ? <InlineError>{error}</InlineError> : <LoadingState label="Starting a new observation…"/>}</main></>;
}
