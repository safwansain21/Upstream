"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppHeader } from "../../components/app-header";
import { DocumentTitle } from "../../components/document-title";
import { ChevronIcon, PlusIcon } from "../../components/icons";
import { DuskScene } from "../../components/scene/dusk-scene";
import { SceneRoute, type Stop } from "../../components/scene/scene-route";
import { InlineError, LoadingState, OriginBadge } from "../../components/ui";
import { api } from "../../lib/api";
import { useMe, useSignedIn } from "../../lib/session";

const ROUTE: Stop[] = [{ x: 490, y: 392, tone: "origin", label: "You" }, { x: 612, y: 448, ghost: true }, { x: 640, y: 520, ghost: true }, { x: 800, y: 548, ghost: true },
  { x: 944, y: 600, tone: "done", label: "Together", detail: "Share knowledge and find what’s possible.", below: true }, { x: 1200, y: 628, ghost: true }, { x: 1348, y: 678, tone: "current" }];

export default function Onboarding() {
  const ready = useSignedIn(); const me = useMe(ready); const client = useQueryClient();
  const [name, setName] = useState(""); const [status, setStatus] = useState(""); const [error, setError] = useState("");
  useEffect(() => { if (me.data?.profile) setName(me.data.profile.display_name); }, [me.data]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setStatus("");
    try { await api("/profile", { method: "PATCH", json: { display_name: name } }); setStatus("Profile saved."); client.invalidateQueries({ queryKey: ["me"] }); }
    catch (e) { setError((e as Error).message); }
  }
  const orgs = me.data?.organizations.filter(o => o.status === "active") ?? [];
  return <div className="screen-top"><DuskScene variant="screen" route={<SceneRoute stops={ROUTE} duration={2.6}/>}/><AppHeader scene={false}/>
    <main id="main-content" className="onboard"><DocumentTitle title="Welcome to Upstream"/>
      <div className="onboard-intro enter"><h1>Welcome to Upstream.</h1><p className="lead">Tell us what to call you. Your contact details stay private.</p></div>
      {!me.data ? <div className="onboard-state">{me.error ? <InlineError>{me.error.message}</InlineError> : <LoadingState/>}</div> : <>
        <form className="onboard-profile stack enter enter-1" onSubmit={save} aria-labelledby="profile-heading">
          <h2 id="profile-heading">Your profile</h2><p className="muted">This name is visible to other contributors in your organizations.</p>
          {error ? <InlineError>{error}</InlineError> : null}
          <div className="form-field"><label htmlFor="name">Display name</label><input id="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)}/></div>
          <button className="button button-primary button-block">Save profile</button>
          <p className="field-help" role="status">{status || "You can change this at any time in settings."}</p>
        </form>
        <section className="onboard-orgs stack enter enter-2" aria-labelledby="orgs-heading">
          <h2 id="orgs-heading">Your organizations</h2><p className="muted">Work with a group to turn observations into coordinated investigations.</p>
          {orgs.length ? <ul className="org-list">{orgs.map(o => <li key={o.id}><Link href={`/app/${o.id}/investigations`} className="org-row">
            <span className="org-mark" aria-hidden="true"/><span className="org-name"><strong>{o.name}</strong>{o.example ? <OriginBadge origin="synthetic"/> : null}</span>
            <span className="button button-outline button-small">Open workspace</span><ChevronIcon/></Link></li>)}</ul>
            : <p className="org-empty"><PlusIcon/> You are not a member of an organization yet. Organization administrators can invite you to a monitoring group.</p>}
          <div className="onboard-action"><p className="eyebrow amber">Take action</p><Link className="button button-primary" href="/report/new">Report an observation <ChevronIcon/></Link>
            <p className="onboard-note">Not part of an organization yet? An observation you submit goes to the configured intake organization for triage, and can help inform future investigations.</p></div>
        </section>
        <p className="onboard-margin" aria-hidden="true">Better questions start<br/>with people who notice.</p>
      </>}
    </main></div>;
}
