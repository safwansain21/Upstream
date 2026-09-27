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
  return <main id="main-content" className="page-shell settings-page"><PageIntro title="Profile and preferences"><p>Manage your account, preferences and data.</p></PageIntro>
    {error ? <InlineError>{error}</InlineError> : null}
    <form className="settings-row" onSubmit={save} aria-labelledby="profile-heading"><div className="settings-copy"><h2 id="profile-heading">Display name</h2><p>Used in the app and on your contributions inside this workspace. You can change it at any time.</p></div>
      <div className="settings-control inline-control"><div className="form-field"><label htmlFor="name">Display name</label><input id="name" maxLength={100} value={name} onChange={e => setName(e.target.value)}/></div>
        <button className="button button-primary" disabled={!name.trim()}>Save</button><p role="status" className="settings-saved">{saved}</p></div></form>
    <section className="settings-row" aria-labelledby="motion-heading"><div className="settings-copy"><h2 id="motion-heading">Motion and map</h2><p>Stop the moving water and swaying foliage, or simplify the maps. Every feature stays the same.</p></div>
      <div className="settings-control"><MotionSettings/></div></section>
    <section className="settings-row" aria-labelledby="drafts-heading"><div className="settings-copy"><h2 id="drafts-heading">Drafts on this device</h2><p>Unsent observations stored in this browser for your account only.</p></div>
      <div className="settings-control stack">{drafts === null ? <LoadingState label="Checking this device…"/> : unsent.length ? <ul className="draft-list" aria-label="Unsent drafts">{unsent.map(d => <li key={d.id}>
          <strong>{d.description?.trim() ? d.description.trim().slice(0, 60) : "Untitled observation"}</strong><span>{d.landmark || "No place yet"} · {d.status === "queued" ? "waiting for a connection" : d.status === "failed" ? "could not send; open it to retry" : "not sent"}</span></li>)}</ul>
          : <p className="muted">No unsent drafts on this device.</p>}
        <div className="button-row"><button className="button button-outline" disabled={!unsent.length} onClick={downloadDrafts}>Download drafts</button>
          <button className="button button-quiet" disabled={!unsent.length} onClick={clearDrafts}>Clear unsent drafts</button></div>
        <p className="settings-caution">Device storage is not encryption. Anyone using this browser profile could read these drafts.</p></div></section>
    <section className="settings-row" aria-labelledby="privacy-heading"><div className="settings-copy"><h2 id="privacy-heading">Your data</h2><p>Download everything Upstream holds that identifies you, or ask for your account to be deleted.</p></div>
      <div className="settings-control settings-split"><div className="stack"><button className="button button-outline" onClick={exportData}>Download my data</button><p className="muted">One JSON file with your profile, contributions and settings.</p></div>
        <div className="stack"><button className="button button-danger" onClick={requestDeletion}>Request account deletion</button><p className="muted">Deleting disables your account and public identity at once. Measurements and reports stay as evidence without your name; remaining contact data is removed after administrator review.</p></div></div></section></main>;
}
