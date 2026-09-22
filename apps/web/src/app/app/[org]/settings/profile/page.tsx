"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MotionSettings } from "../../../../../components/motion-settings";
import { InlineError, LoadingState, PageIntro, PageState } from "../../../../../components/ui";
import { api, supabase } from "../../../../../lib/api";
import { db, type Draft } from "../../../../../lib/drafts";
import { useMe } from "../../../../../lib/session";

export default function Profile() {
  const me = useMe(); const client = useQueryClient();
  const [name, setName] = useState(""); const [error, setError] = useState(""); const [saved, setSaved] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  useEffect(() => { if (me.data?.profile) setName(me.data.profile.display_name); }, [me.data]);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => db.drafts.where("account").anyOf(data.session?.user.id ?? "", "guest").toArray().then(setDrafts, () => setDrafts([]))); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSaved("");
    try { await api("/profile", { method: "PATCH", json: { display_name: name } }); setSaved("Profile saved."); client.invalidateQueries({ queryKey: ["me"] }); }
    catch (err) { setError((err as Error).message); }
  }
  function downloadDrafts() {
    const text = JSON.stringify(drafts?.map(({ photos, ...d }) => ({ ...d, photos: photos?.map(p => p.name) })), null, 2);
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "application/json" })), download: "upstream-drafts.json" });
    a.click(); URL.revokeObjectURL(a.href);
  }
  async function clearDrafts() {
    if (!confirm("Delete all unsent drafts stored on this device? Submitted reports are not affected.")) return;
    await db.drafts.bulkDelete((drafts ?? []).filter(d => d.status !== "server_received").map(d => d.id)); setDrafts(await db.drafts.toArray());
  }
  async function exportData() {
    setError("");
    try { const data = await api("/me/export");
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), download: "upstream-my-data.json" });
      a.click(); URL.revokeObjectURL(a.href); } catch (err) { setError((err as Error).message); }
  }
  async function requestDeletion() {
    if (!confirm("Request deletion? You will be signed out and cannot sign in again. Evidence you contributed stays without your name.")) return;
    try { await api("/me/deletion-request", { method: "POST", json: { confirm: true } }); await supabase.auth.signOut(); location.href = "/"; }
    catch (err) { setError((err as Error).message); }
  }
  if (me.error) return <PageState title="Profile" error={me.error} retry={() => me.refetch()}/>;
  if (!me.data) return <PageState title="Profile"/>;
  const unsent = (drafts ?? []).filter(d => d.status !== "server_received");
  return <main id="main-content" className="page-shell"><PageIntro title="Profile and preferences"/>
    <form className="surface stack" onSubmit={save}><h2>Profile</h2>{error ? <InlineError>{error}</InlineError> : null}
      <div className="form-field"><label htmlFor="name">Display name</label><input id="name" maxLength={100} value={name} onChange={e => setName(e.target.value)}/></div>
      <button className="button button-primary" disabled={!name.trim()}>Save</button><p role="status">{saved}</p></form>
    <MotionSettings/>
    <section className="surface stack" aria-labelledby="drafts-heading"><h2 id="drafts-heading">Drafts on this device</h2>
      <p>Drafts are stored in this browser for your account only. Device storage is not encryption.</p>
      {drafts === null ? <LoadingState/> : <p>{unsent.length} unsent draft(s).</p>}
      <div className="button-row"><button className="button button-outline" disabled={!unsent.length} onClick={downloadDrafts}>Download drafts</button>
        <button className="button button-quiet" disabled={!unsent.length} onClick={clearDrafts}>Clear unsent drafts</button></div></section>
    <section className="surface stack" aria-labelledby="privacy-heading"><h2 id="privacy-heading">Your data</h2>
      <p>Download everything Upstream holds that identifies you, or ask for your account to be deleted. Deleting disables your account and public identity at once; measurements and reports stay as evidence without your name, and remaining contact data is removed after administrator review.</p>
      <div className="button-row"><button className="button button-outline" onClick={exportData}>Download my data</button>
        <button className="button button-quiet" onClick={requestDeletion}>Request account deletion</button></div></section></main>;
}
