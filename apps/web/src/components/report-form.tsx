"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, supabase } from "../lib/api";
import { claimGuestDrafts, db, MAX_PHOTO_BYTES, PHOTO_TYPES, toReportBody, uuidv7, validate, type Draft, type Photo } from "../lib/drafts";
import { InlineError, LoadingState } from "./ui";

const MapView = dynamic(() => import("./map-view").then(m => m.MapView), { ssr: false, loading: () => <LoadingState label="Loading map…"/> });

const CATEGORIES: [string, string][] = [["unusual_foam", "Unusual foam"], ["colour_change", "Change in colour"], ["odour", "Odour noticed (without deliberately smelling)"],
  ["dead_wildlife", "Dead wildlife"], ["visible_discharge", "Visible discharge"], ["habitat_access", "Habitat or access concern"], ["other", "Something else"]];
const STEPS = ["Observation", "Location", "Review"];

export function ReportForm({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [geoBusy, setGeoBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user.id ?? null;
      if (user) await claimGuestDrafts(user);
      setAccount(user);
      const found = await db.drafts.get(draftId);
      if (!found || (found.account !== "guest" && found.account !== user)) setMissing(true); // never show another account's draft
      else setDraft(found);
    })();
  }, [draftId]);

  function update(patch: Partial<Draft>) {
    setDraft(current => {
      if (!current) return current;
      const next = { ...current, ...patch, updatedAt: Date.now() };
      db.drafts.put(next).catch(() => setNotice("This browser could not save the draft. Keep this tab open or copy your text."));
      return next;
    });
  }
  function go(step: 1 | 2 | 3) {
    const found = step > draft!.step ? validate(draft!, draft!.step) : {};
    setErrors(found);
    if (Object.keys(found).length) { requestAnimationFrame(() => summary.current?.focus()); return; }
    update({ step }); requestAnimationFrame(() => heading.current?.focus());
  }
  function locate() {
    if (!("geolocation" in navigator)) { setNotice("Location is not available in this browser. Describe a landmark or enter coordinates."); return; }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      p => { setGeoBusy(false); update({ latitude: p.coords.latitude.toFixed(6), longitude: p.coords.longitude.toFixed(6), accuracy: String(Math.round(p.coords.accuracy)), method: "gps" }); },
      () => { setGeoBusy(false); setNotice("Location permission was not granted. You can still describe a landmark or enter coordinates."); },
      { enableHighAccuracy: true, timeout: 15000 });
  }
  function addPhotos(files: FileList | null) {
    if (!files) return;
    const photos = [...(draft!.photos ?? [])];
    for (const file of Array.from(files)) {
      if (photos.length >= 5) { setNotice("You can attach up to 5 photos."); break; }
      if (!PHOTO_TYPES.includes(file.type)) { setNotice(`${file.name} is not a JPEG, PNG or WebP photo.`); continue; }
      if (file.size > MAX_PHOTO_BYTES) { setNotice(`${file.name} is larger than 15 MB.`); continue; }
      photos.push({ id: uuidv7(), name: file.name, type: file.type, size: file.size, blob: file });
    }
    update({ photos });
  }
  async function uploadPhotos(current: Draft): Promise<Photo[] | null> {
    const photos = [...(current.photos ?? [])];
    for (let i = 0; i < photos.length; i++) {
      if (photos[i].mediaId) continue;
      update({ error: `Uploading photo ${i + 1} of ${photos.length}…` });
      const form = new FormData(); form.append("file", photos[i].blob, photos[i].name); form.append("keep_original", String(current.keepOriginals));
      try { const r = await api<{ id: string }>(`/orgs/${current.org}/uploads`, { method: "POST", body: form }); photos[i] = { ...photos[i], mediaId: r.id, error: undefined }; }
      catch (e) { photos[i] = { ...photos[i], error: (e as Error).message }; update({ photos }); return null; }
      update({ photos });
    }
    return photos;
  }
  async function submit() {
    const found = validate(draft!, 3); setErrors(found);
    if (Object.keys(found).length) { requestAnimationFrame(() => summary.current?.focus()); return; }
    if (!account) { router.push(`/sign-in?next=${encodeURIComponent(`/report/${draftId}/edit`)}`); return; }
    update({ status: "submitting", error: undefined });
    const photos = await uploadPhotos(draft!);
    if (!photos) { update({ status: "device_saved", error: "A photo could not be uploaded. Retry, or remove it and submit without it. Nothing else was lost." }); return; }
    try {
      const result = await api<{ id: string; case_id: string; org_id: string }>(`/orgs/${draft!.org}/reports`, { method: "POST", json: toReportBody({ ...draft!, photos }), idempotencyKey: draft!.id });
      update({ status: "server_received", result });
      router.push(`/app/${result.org_id}/reports/${result.id}?received=1`);
    } catch (e) {
      const err = e as ApiError;
      if (err.fieldErrors) setErrors(err.fieldErrors);
      update({ status: err.retryable || err.code === "NETWORK" ? "device_saved" : "failed", error: err.code === "NETWORK" ? "Saved on this device. Not submitted yet." : err.message });
      if (err.code === "AUTH_REQUIRED") router.push(`/sign-in?next=${encodeURIComponent(`/report/${draftId}/edit`)}`);
    }
  }

  if (missing) return <InlineError>This draft is not on this device for the current account. <Link href="/report/new">Start a new observation</Link></InlineError>;
  if (!draft) return <LoadingState label="Opening your draft…"/>;
  if (draft.status === "server_received" && draft.result) return <section className="surface stack"><h2>Already submitted</h2><p>Your report has been received for review. The cause is not established.</p><Link className="button button-primary" href={`/app/${draft.result.org_id}/reports/${draft.result.id}`}>View receipt</Link></section>;
  const err = (k: string) => errors[k] ? <p className="field-error" id={`${k}-error`}>{errors[k]}</p> : null;
  const described = (k: string, help?: string) => [errors[k] ? `${k}-error` : "", help || ""].filter(Boolean).join(" ") || undefined;
  const hasPoint = draft.latitude !== "" && draft.longitude !== "";

  return <div className="stack">
    <ol className="tab-nav" aria-label="Report steps">{STEPS.map((label, i) => <li key={label} aria-current={draft.step === i + 1 ? "step" : undefined} className={draft.step === i + 1 ? "active" : undefined}>{i + 1}. {label}</li>)}</ol>
    <p className="muted" role="status">{draft.status === "submitting" ? draft.error || "Sending to Upstream…" : draft.error || "Saved on this device. Not submitted yet."}</p>
    {notice ? <p className="notice" role="status">{notice}</p> : null}
    {Object.keys(errors).length ? <div className="inline-error" role="alert" tabIndex={-1} ref={summary}><strong>Please fix:</strong><ul>{Object.entries(errors).map(([k, v]) => <li key={k}><a href={`#${k}`}>{v}</a></li>)}</ul></div> : null}

    {draft.step === 1 ? <section className="surface stack" aria-labelledby="step-heading"><h2 id="step-heading" tabIndex={-1} ref={heading}>What did you notice?</h2>
      <fieldset id="categories"><legend>Choose any that fit (optional)</legend>{CATEGORIES.map(([code, label]) => <label className="checkbox-field" key={code}><input type="checkbox" checked={draft.categories.includes(code)} onChange={e => update({ categories: e.target.checked ? [...draft.categories, code] : draft.categories.filter(c => c !== code) })}/><span>{label}</span></label>)}</fieldset>
      <div className="form-field"><label htmlFor="description">Describe your observation</label><textarea id="description" rows={5} maxLength={2000} value={draft.description} aria-invalid={!!errors.description} aria-describedby={described("description", "description-help")} onChange={e => update({ description: e.target.value })}/><p className="field-help" id="description-help">{draft.description.length} / 2000. What did you see, where and when? A photo or description records what you saw; it does not establish the cause.</p>{err("description")}</div>
      <div className="form-field"><label htmlFor="observedAt">When did you observe it? <span className="muted">({draft.timezone})</span></label><input id="observedAt" type="datetime-local" value={draft.observedAt} aria-invalid={!!errors.observedAt} aria-describedby={described("observedAt")} onChange={e => update({ observedAt: e.target.value })}/>{err("observedAt")}</div>
      <div className="form-field"><label htmlFor="photos">Photos (optional, up to 5)</label><input id="photos" type="file" accept={PHOTO_TYPES.join(",")} multiple onChange={e => { addPhotos(e.target.files); e.target.value = ""; }} aria-describedby="photos-help"/><p className="field-help" id="photos-help">JPEG, PNG or WebP, 15 MB each. Location data embedded in photos is removed from shared copies. A photo records what you saw; it does not establish the cause.</p></div>
      {draft.photos?.length ? <ul aria-label="Attached photos">{draft.photos.map(p => <li key={p.id}>{p.name} · {(p.size / 1048576).toFixed(1)} MB{p.mediaId ? " · uploaded" : ""}{p.error ? <span className="field-error"> · {p.error}</span> : null} <button type="button" className="button button-quiet" onClick={() => update({ photos: draft.photos.filter(x => x.id !== p.id) })}>Remove<span className="visually-hidden"> {p.name}</span></button></li>)}</ul> : null}
      {draft.photos?.length ? <label className="checkbox-field"><input type="checkbox" checked={draft.keepOriginals} onChange={e => update({ keepOriginals: e.target.checked })}/><span>Keep my original photo files privately for the review team</span></label> : null}
      <div className="button-row"><button type="button" className="button button-primary" onClick={() => go(2)}>Continue to location</button></div></section> : null}

    {draft.step === 2 ? <section className="surface stack" aria-labelledby="step-heading"><h2 id="step-heading" tabIndex={-1} ref={heading}>Where was it?</h2>
      <p className="field-guidance">Use public or approved access points. Do not enter unsafe or private land to make a report.</p>
      <div className="button-row"><button type="button" className="button button-outline" disabled={geoBusy} onClick={locate}>{geoBusy ? "Finding your location…" : "Use my current location"}</button>{hasPoint ? <button type="button" className="button button-quiet" onClick={() => update({ latitude: "", longitude: "", accuracy: "", method: "landmark" })}>Clear coordinates</button> : null}</div>
      <MapView label="Select the map to place a pin where you observed the change" height={280} pin={hasPoint ? { lon: Number(draft.longitude), lat: Number(draft.latitude) } : null}
        onPick={(lon, lat) => update({ latitude: lat.toFixed(6), longitude: lon.toFixed(6), accuracy: "", method: "pin" })}/>
      {hasPoint && draft.method === "pin" ? <p className="muted" role="status">Pin placed at {draft.latitude}, {draft.longitude}. Accuracy is not reported for a hand-placed pin, and it is not moved onto any mapped stream.</p> : null}
      <div className="form-field"><label htmlFor="landmark">Landmark or directions</label><input id="landmark" maxLength={500} value={draft.landmark} aria-invalid={!!errors.landmark} aria-describedby={described("landmark", "landmark-help")} onChange={e => update({ landmark: e.target.value })}/><p className="field-help" id="landmark-help">For example “below the footbridge behind the school”. A landmark alone is enough; the team will confirm the location.</p>{err("landmark")}</div>
      <div className="button-row"><div className="form-field"><label htmlFor="latitude">Latitude (optional)</label><input id="latitude" inputMode="decimal" value={draft.latitude} aria-invalid={!!errors.latitude} aria-describedby={described("latitude")} onChange={e => update({ latitude: e.target.value.trim(), method: "manual" })}/>{err("latitude")}</div>
        <div className="form-field"><label htmlFor="longitude">Longitude (optional)</label><input id="longitude" inputMode="decimal" value={draft.longitude} aria-invalid={!!errors.longitude} aria-describedby={described("longitude")} onChange={e => update({ longitude: e.target.value.trim(), method: "manual" })}/>{err("longitude")}</div></div>
      {hasPoint && draft.accuracy ? <p className="muted">Device-reported accuracy ±{draft.accuracy} m. The location is not snapped to any mapped stream.</p> : null}
      <div className="form-field"><label htmlFor="localName">Stream name, if you know one (optional)</label><input id="localName" maxLength={150} value={draft.localName} onChange={e => update({ localName: e.target.value })}/></div>
      <label className="checkbox-field"><input type="checkbox" checked={draft.unmapped} onChange={e => update({ unmapped: e.target.checked })}/><span>This stream is not on the map</span></label>
      <div className="button-row"><button type="button" className="button button-outline" onClick={() => go(1)}>Back</button><button type="button" className="button button-primary" onClick={() => go(3)}>Continue to review</button></div></section> : null}

    {draft.step === 3 ? <section className="surface stack" aria-labelledby="step-heading"><h2 id="step-heading" tabIndex={-1} ref={heading}>Review and submit</h2>
      <dl><dt>What you noticed</dt><dd>{draft.categories.map(c => CATEGORIES.find(([k]) => k === c)?.[1]).join(", ") || "No category selected"}</dd><dd>{draft.description || "No description"}</dd>
        <dt>When</dt><dd>{draft.observedAt.replace("T", " ")} ({draft.timezone})</dd>
        <dt>Location</dt><dd>{hasPoint ? `${draft.latitude}, ${draft.longitude}${draft.accuracy ? ` ±${draft.accuracy} m` : ""}` : "Coordinates not provided: location verification needed"}{draft.landmark ? ` · ${draft.landmark}` : ""}</dd>
        <dt>Photos</dt><dd>{draft.photos?.length ? draft.photos.map(p => p.name).join(", ") : "None (text-only report)"}</dd>
        {draft.localName || draft.unmapped ? <><dt>Stream</dt><dd>{draft.localName || "Unnamed"}{draft.unmapped ? " · not on the map" : ""}</dd></> : null}</dl>
      {account && hasPoint ? <Duplicates draft={draft} onChoose={id => update({ suggestedCaseId: id })}/> : null}
      <label className="checkbox-field"><input type="checkbox" checked={draft.publicVisibility} onChange={e => update({ publicVisibility: e.target.checked })}/><span>Allow a generalized public summary of this report</span></label>
      <p className="field-help">Private to the receiving organization by default. Precise location and your contact details are never public.</p>
      {!account ? <p className="notice">You will be asked to sign in and verify your email before the report is sent. Your draft stays on this device.</p> : null}
      <div className="button-row"><button type="button" className="button button-outline" onClick={() => go(2)}>Back</button><button type="button" className="button button-quiet" onClick={() => setNotice("Draft saved on this device.")}>Save draft</button><button type="button" className="button button-primary" disabled={draft.status === "submitting"} onClick={submit}>{draft.status === "submitting" ? "Submitting…" : draft.error ? "Retry submission" : "Submit report"}</button></div></section> : null}
  </div>;
}

type Suggestion = { case_id: string; title: string; distance_m: number; days_apart: number };
function Duplicates({ draft, onChoose }: { draft: Draft; onChoose: (id: string | undefined) => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ lat: draft.latitude, lon: draft.longitude, observed_at: toReportBody(draft).observed_at });
    api<Suggestion[]>(`/orgs/${draft.org}/duplicate-suggestions?${params}`).then(setItems, () => setItems([]));
  }, [draft.org, draft.latitude, draft.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items?.length) return null;
  return <fieldset><legend>Possibly related investigations nearby</legend>
    <p className="field-help">Your report is saved either way. A coordinator decides whether reports describe the same event; nothing is merged automatically.</p>
    <label className="checkbox-field"><input type="radio" name="dup" checked={!draft.suggestedCaseId} onChange={() => onChoose(undefined)}/><span>This is a new observation</span></label>
    {items.map(i => <label key={i.case_id} className="checkbox-field"><input type="radio" name="dup" checked={draft.suggestedCaseId === i.case_id} onChange={() => onChoose(i.case_id)}/>
      <span>It may be the same as “{i.title}” (about {i.distance_m} m away, {i.days_apart} day(s) apart)</span></label>)}</fieldset>;
}
