"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppHeader } from "../../components/app-header";
import { InlineError, LoadingState, PageIntro } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe, useSignedIn } from "../../lib/session";

export default function Onboarding() {
  const ready = useSignedIn(); const me = useMe(ready); const client = useQueryClient();
  const [name, setName] = useState(""); const [status, setStatus] = useState(""); const [error, setError] = useState("");
  useEffect(() => { if (me.data?.profile) setName(me.data.profile.display_name); }, [me.data]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setStatus("");
    try { await api("/profile", { method: "PATCH", json: { display_name: name } }); setStatus("Profile saved."); client.invalidateQueries({ queryKey: ["me"] }); }
    catch (e) { setError((e as Error).message); }
  }
  if (!me.data) return <><AppHeader/><main id="main-content" className="page-shell">{me.error ? <InlineError>{me.error.message}</InlineError> : <LoadingState/>}</main></>;
  const orgs = me.data.organizations.filter(o => o.status === "active");
  return <><AppHeader/><main id="main-content" className="page-shell"><PageIntro title="Welcome to Upstream"><p>Tell us what to call you. Your contact details stay private.</p></PageIntro>
    <form className="surface stack" onSubmit={save}>{error ? <InlineError>{error}</InlineError> : null}
      <div className="form-field"><label htmlFor="name">Display name</label><input id="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></div>
      <div className="button-row"><button className="button button-primary">Save profile</button></div><p role="status">{status}</p></form>
    <section className="surface stack"><h2>Organizations</h2>{orgs.length ? <ul>{orgs.map(o => <li key={o.id}><Link className="text-link" href={`/app/${o.id}/investigations`}>{o.name}</Link>{o.example ? " · Example data" : ""}</li>)}</ul>
      : <p>You are not a member of an organization yet. An observation you submit goes to the configured intake organization for triage. Organization administrators can invite you to a monitoring group.</p>}
      <Link className="button button-outline" href="/report/new">Report an observation</Link></section></main></>;
}
