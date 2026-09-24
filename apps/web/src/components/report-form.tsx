"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, supabase } from "../lib/api";
import { claimGuestDrafts, db, MAX_PHOTO_BYTES, PHOTO_TYPES, toReportBody, uuidv7, validate, type Draft } from "../lib/drafts";
import { claim, sendDraft } from "../lib/submit";
import { Arrow } from "./brand";
import { AlertIcon, CalendarIcon, DocIcon, LockIcon, PhotoIcon, PinIcon, ShieldIcon } from "./icons";
import { InkNote } from "./ink-note";
import { NOTEBOOK, ScenePicture } from "./scene/scene-picture";
import { InlineError, LoadingState } from "./ui";

const MapView = dynamic(() => import("./map-view").then(m => m.MapView), { ssr: false, loading: () => <LoadingState label="Loading map…"/> });

const CATEGORIES: [string, string][] = [["unusual_foam", "Unusual foam"], ["colour_change", "Change in colour"], ["odour", "Odour noticed (without deliberately smelling)"],
  ["dead_wildlife", "Dead wildlife"], ["visible_discharge", "Visible discharge"], ["habitat_access", "Habitat or access concern"], ["other", "Something else"]];

export function ReportForm({ draftId }: { draftId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
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

  useEffect(() => { // the global sync queue may send this draft; follow its stored state
    const refresh = () => db.drafts.get(draftId).then(d => { if (d) setDraft(d); });
    window.addEventListener("upstream-drafts", refresh);
    return () => window.removeEventListener("upstream-drafts", refresh);
  }, [draftId]);
  useEffect(() => {
    if (draft?.status !== "server_received" || !draft.result) return;
    const result = draft.result;
    // The intake membership may have been created by this submission, while /me is still cached from sign-in.
    void queryClient.invalidateQueries({ queryKey: ["me"] }).then(() =>
      router.push(`/app/${result.org_id}/reports/${result.id}?received=1`));
  }, [draft?.status, draft?.result, queryClient, router]);

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
  async function submit() {
    const found = validate(draft!, 3); setErrors(found);
    if (Object.keys(found).length) { requestAnimationFrame(() => summary.current?.focus()); return; }
    if (!account) { router.push(`/sign-in?next=${encodeURIComponent(`/report/${draftId}/edit`)}`); return; }
    const claimed = await claim(draftId, ["device_saved", "queued", "failed"]);
    if (!claimed) return; // already being sent (another tab or the sync queue)
    setDraft(claimed);
    const outcome = await sendDraft(claimed, patch => { update(patch); });
    if (outcome.ok) return; // the server_received effect refreshes membership before navigation
    if (outcome.error.fieldErrors) setErrors(outcome.error.fieldErrors);
    if (outcome.error.code === "AUTH_REQUIRED") router.push(`/sign-in?next=${encodeURIComponent(`/report/${draftId}/edit`)}`);
  }

  if (missing) return <InlineError>This draft is not on this device for the current account. <Link href="/report/new">Start a new observation</Link></InlineError>;
  if (!draft) return <LoadingState label="Opening your draft…"/>;
  if (draft.status === "server_received" && draft.result) return <section className="surface stack"><h2>Already submitted</h2><p>Your report has been received for review. The cause is not established.</p><Link className="button button-primary" href={`/app/${draft.result.org_id}/reports/${draft.result.id}`}>View receipt</Link></section>;
  const err = (k: string) => errors[k] ? <p className="field-error" id={`${k}-error`}>{errors[k]}</p> : null;
  const described = (k: string, help?: string) => [errors[k] ? `${k}-error` : "", help || ""].filter(Boolean).join(" ") || undefined;
  const hasPoint = draft.latitude !== "" && draft.longitude !== "";

  const whatText = [draft.categories.map(c => CATEGORIES.find(([k]) => k === c)?.[1]).join(", "), draft.description].filter(Boolean).join(" · ") || "No category or description yet";
  return <div className="report-flow">
    <ReportSteps step={draft.step}/>
    <p className="autosave" role="status"><span className="autosave-dot" aria-hidden="true"/>{draft.status === "submitting" ? draft.error || "Sending to Upstream…" : draft.error || "Saved on this device. Not submitted yet."}</p>
    {notice ? <p className="notice" role="status">{notice}</p> : null}
    {Object.keys(errors).length ? <div className="inline-error" role="alert" tabIndex={-1} ref={summary}><strong>Please fix:</strong><ul>{Object.entries(errors).map(([k, v]) => <li key={k}><a href={`#${k}`}>{v}</a></li>)}</ul></div> : null}
    <FieldNote step={draft.step}/>

    {draft.step === 1 ? <section key="s1" className="report-step" aria-labelledby="step-heading"><div className="report-grid">
      <div className="surface stack">
        <h2 id="step-heading" tabIndex={-1} ref={heading}>What did you notice?</h2>
        <fieldset id="categories"><legend>Choose any that fit (optional)</legend><div className="choice-grid">{CATEGORIES.map(([code, label]) => <label className="choice" key={code}><input type="checkbox" checked={draft.categories.includes(code)} onChange={e => update({ categories: e.target.checked ? [...draft.categories, code] : draft.categories.filter(c => c !== code) })}/><CategoryGlyph code={code}/><span>{label}</span></label>)}</div></fieldset>
        <div className="form-field"><label htmlFor="description">Describe your observation</label><textarea id="description" rows={4} maxLength={2000} placeholder="For example: the water looked murky and brown, or there was foam near the shore." value={draft.description} aria-invalid={!!errors.description} aria-describedby={described("description", "description-help")} onChange={e => update({ description: e.target.value })}/><p className="field-help spread" id="description-help"><span>What did you see, and where? It records what you saw; it does not establish the cause.</span><span className="numeric">{draft.description.length} / 2000</span></p>{err("description")}</div>
        <div className="form-field"><label htmlFor="observedAt">When did you notice it? <span className="subtle">({draft.timezone})</span></label><input id="observedAt" type="datetime-local" value={draft.observedAt} aria-invalid={!!errors.observedAt} aria-describedby={described("observedAt", "when-help")} onChange={e => update({ observedAt: e.target.value })}/><p className="field-help" id="when-help">Use the best estimate if you are not sure.</p>{err("observedAt")}</div>
      </div>
      <div className="surface stack">
        <h3>Add photos <span className="subtle">(optional)</span></h3>
        <div className="dropzone"><PhotoIcon size={34}/><div className="form-field"><label htmlFor="photos">Photos (optional, up to 5)</label><input id="photos" type="file" accept={PHOTO_TYPES.join(",")} multiple onChange={e => { addPhotos(e.target.files); e.target.value = ""; }} aria-describedby="photos-help"/></div>
          <p className="field-help" id="photos-help">JPEG, PNG or WebP, up to 15 MB each. A photo records what you saw; it does not establish the cause.</p></div>
        {draft.photos?.length ? <ul className="photo-list" aria-label="Attached photos">{draft.photos.map(p => <li key={p.id}><PhotoIcon size={18}/><span>{p.name}</span><span className="subtle">{(p.size / 1048576).toFixed(1)} MB{p.mediaId ? " · uploaded" : ""}</span>{p.error ? <span className="field-error">{p.error}</span> : null}<button type="button" className="button button-quiet" aria-label={`Remove ${p.name}`} onClick={() => update({ photos: draft.photos.filter(x => x.id !== p.id) })}>Remove</button></li>)}</ul> : null}
        {draft.photos?.length ? <label className="checkbox-field"><input type="checkbox" checked={draft.keepOriginals} onChange={e => update({ keepOriginals: e.target.checked })}/><span>Keep my original photo files privately for the review team</span></label> : null}
        <p className="icon-line small muted"><LockIcon size={18}/><span>Location data embedded in photos is removed from shared copies. Photos help others understand what you saw.</span></p>
        {account ? <AiAssist draft={draft} onAccept={patch => update(patch)}/> : null}
      </div></div>
      <div className="report-actions"><p className="safety-line"><AlertIcon size={20}/>Stay on safe, permitted access routes.</p><button type="button" className="button button-primary" onClick={() => go(2)}>Continue to location <Arrow/></button></div></section> : null}

    {draft.step === 2 ? <section key="s2" className="report-step" aria-labelledby="step-heading"><div className="report-grid">
      <div className="surface stack">
        <h2 id="step-heading" tabIndex={-1} ref={heading}>Where was it?</h2>
        <p className="field-guidance">Use public or approved access points. Do not enter unsafe or private land to make a report.</p>
        <div className="form-field"><label htmlFor="landmark">Landmark or directions</label><textarea id="landmark" rows={2} maxLength={500} placeholder="For example: below the footbridge behind the school" value={draft.landmark} aria-invalid={!!errors.landmark} aria-describedby={described("landmark", "landmark-help")} onChange={e => update({ landmark: e.target.value })}/><p className="field-help" id="landmark-help">A landmark alone is enough; the team will confirm the location.</p>{err("landmark")}</div>
        <div className="field-grid"><div className="form-field"><label htmlFor="latitude">Latitude (optional)</label><input id="latitude" inputMode="decimal" value={draft.latitude} aria-invalid={!!errors.latitude} aria-describedby={described("latitude")} onChange={e => update({ latitude: e.target.value.trim(), method: "manual" })}/>{err("latitude")}</div>
          <div className="form-field"><label htmlFor="longitude">Longitude (optional)</label><input id="longitude" inputMode="decimal" value={draft.longitude} aria-invalid={!!errors.longitude} aria-describedby={described("longitude")} onChange={e => update({ longitude: e.target.value.trim(), method: "manual" })}/>{err("longitude")}</div></div>
        {hasPoint && draft.accuracy ? <p className="subtle small">Device-reported accuracy ±{draft.accuracy} m. The location is not snapped to any mapped stream.</p> : null}
        <div className="form-field"><label htmlFor="localName">Stream name, if you know one (optional)</label><input id="localName" maxLength={150} value={draft.localName} onChange={e => update({ localName: e.target.value })}/></div>
        <label className="checkbox-field"><input type="checkbox" checked={draft.unmapped} onChange={e => update({ unmapped: e.target.checked })}/><span>This stream is not on the map</span></label>
      </div>
      <div className="surface stack map-surface">
        <div className="spread"><h3>Add a location <span className="subtle">(optional)</span></h3><div className="button-row"><button type="button" className="button button-outline button-small" disabled={geoBusy} onClick={locate}>{geoBusy ? "Finding your location…" : "Use my current location"}</button>{hasPoint ? <button type="button" className="button button-quiet" onClick={() => update({ latitude: "", longitude: "", accuracy: "", method: "landmark" })}>Clear coordinates</button> : null}</div></div>
        <MapView label="Select the map to place a pin where you observed the change" height={340} pin={hasPoint ? { lon: Number(draft.longitude), lat: Number(draft.latitude) } : null}
          onPick={(lon, lat) => update({ latitude: lat.toFixed(6), longitude: lon.toFixed(6), accuracy: "", method: "pin" })}/>
        {hasPoint && draft.method === "pin" ? <p className="subtle small" role="status">Pin placed at {draft.latitude}, {draft.longitude}. Accuracy is not reported for a hand-placed pin, and it is not moved onto any mapped stream.</p> : null}
      </div></div>
      <div className="report-actions"><button type="button" className="button button-outline" onClick={() => go(1)}>Back</button><button type="button" className="button button-primary" onClick={() => go(3)}>Continue to review <Arrow/></button></div></section> : null}

    {draft.step === 3 ? <section key="s3" className="report-step" aria-labelledby="step-heading"><div className="report-grid review-grid">
      <div className="surface">
        <h2 id="step-heading" tabIndex={-1} ref={heading} className="visually-hidden">Review and submit</h2>
        <dl className="review-list">
          <div><DocIcon/><dt>What happened</dt><dd>{whatText}</dd><button type="button" className="button button-outline button-small" onClick={() => go(1)} aria-label="Edit what happened">Edit</button></div>
          <div><CalendarIcon/><dt>When</dt><dd>{draft.observedAt.replace("T", " ")} ({draft.timezone})</dd><button type="button" className="button button-outline button-small" onClick={() => go(1)} aria-label="Edit when">Edit</button></div>
          <div><PinIcon/><dt>Where</dt><dd>{hasPoint ? `${draft.latitude}, ${draft.longitude}${draft.accuracy ? ` ±${draft.accuracy} m` : ""}` : "Coordinates not provided: location verification needed"}{draft.landmark ? <><br/><span className="subtle">{draft.landmark}</span></> : null}{draft.localName || draft.unmapped ? <><br/><span className="subtle">{draft.localName || "Unnamed stream"}{draft.unmapped ? " · not on the map" : ""}</span></> : null}</dd><button type="button" className="button button-outline button-small" onClick={() => go(2)} aria-label="Edit where">Edit</button></div>
          <div><PhotoIcon/><dt>Photo ({draft.photos?.length ?? 0})</dt><dd>{draft.photos?.length ? draft.photos.map(p => p.name).join(", ") : "None (text-only report)"}</dd><button type="button" className="button button-outline button-small" onClick={() => go(1)} aria-label="Edit photos">Edit</button></div>
        </dl>
        {account && hasPoint ? <Duplicates draft={draft} onChoose={id => update({ suggestedCaseId: id })}/> : null}
      </div>
      <div className="surface stack">
        <h3 className="panel-heading">Visibility and consent</h3><p className="muted">Choose who can see your observation. Your exact location and identity are kept private.</p>
        <fieldset className="stack-tight"><legend className="visually-hidden">Who can see this report</legend>
          <label className="choice choice-card"><input type="radio" name="visibility" checked={!draft.publicVisibility} onChange={() => update({ publicVisibility: false })}/><strong>Private to the receiving organization</strong><span>Seen only by the team who reviews it. Precise location and your contact details are never public.</span></label>
          <label className="choice choice-card"><input type="radio" name="visibility" checked={draft.publicVisibility} onChange={() => update({ publicVisibility: true })}/><strong>Also allow a generalized public summary</strong><span>Helps build wider awareness. Precise location and your contact details are never public.</span></label></fieldset>
        <div className="icon-line"><LockIcon/><div><strong>Photos and location</strong><p className="small muted">Location metadata is removed from shared copies. Your identity is never shared publicly. <Link className="text-link" href="/privacy">Privacy</Link></p></div></div>
        {!account ? <p className="notice">You will be asked to sign in and verify your email before the report is sent. Your draft stays on this device.</p> : null}
      </div></div>
      <div className="report-actions submit-bar"><p className="icon-line"><ShieldIcon/><span><strong>This report documents what you noticed; it does not establish a cause.</strong><br/><span className="subtle small">Observations help inform further investigation by qualified people.</span></span></p>
        <div className="button-row"><button type="button" className="button button-quiet" onClick={() => go(2)}>Back</button><button type="button" className="button button-outline" onClick={() => setNotice("Draft saved on this device.")}>Save draft</button><button type="button" className="button button-primary" disabled={draft.status === "submitting"} onClick={submit}>{draft.status === "submitting" ? "Submitting…" : draft.error ? "Retry submission" : "Submit report"}</button></div></div></section> : null}
  </div>;
}

const STEP_NAMES = ["What happened", "Where it was", "Review"];
/** Progress through the real form steps: the line grows to the current step (M-15). */
function ReportSteps({ step }: { step: number }) {
  return <ol className="report-steps" aria-label="Report steps" style={{ ["--step" as string]: step }}>{STEP_NAMES.map((label, i) =>
    <li key={label} aria-current={step === i + 1 ? "step" : undefined} className={step > i + 1 ? "done" : step === i + 1 ? "active" : undefined}><span className="step-dot" aria-hidden="true">{i + 1}</span><span>{label}</span></li>)}</ol>;
}
const NOTES: Record<number, string[]> = { 1: ["What did you see?", "When was it?"], 2: ["Where was it?", "A landmark is enough."], 3: ["Read it over.", "Then send it on."] };
/** The field notebook beside the form: step guidance in ink (never a copy of what the person typed). */
function FieldNote({ step }: { step: number }) {
  return <figure className="field-notebook" aria-hidden="true"><ScenePicture asset={NOTEBOOK} sizes="300px"/><InkNote key={step} lines={NOTES[step] ?? NOTES[1]}/></figure>;
}
function CategoryGlyph({ code }: { code: string }) {
  const d: Record<string, string> = { unusual_foam: "M7 15a3 3 0 1 0 0-.1M14 9a4 4 0 1 0 0-.1M16.5 17a2 2 0 1 0 0-.1", colour_change: "M12 3.5s-6 6.6-6 10.5a6 6 0 0 0 12 0c0-3.9-6-10.5-6-10.5Z",
    odour: "M8 20c-2-3 2-5 0-8s2-5 0-8M13 20c-2-3 2-5 0-8s2-5 0-8M18 20c-2-3 2-5 0-8s2-5 0-8", dead_wildlife: "M3 12c3-4 8-5 13-2l4-3v10l-4-3c-5 3-10 2-13-2Zm12-1h.1",
    visible_discharge: "M3 7h9v4H3zM12 8h3M15 6v4M9 11c0 3-2 4-2 6a2 2 0 0 0 4 0c0-2-2-3-2-6", habitat_access: "M5 19c0-8 5-14 15-15-1 10-7 15-15 15ZM5 19l9-9", other: "M6 12h.1M12 12h.1M18 12h.1" };
  return <svg className="choice-glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d[code] ?? d.other}/></svg>;
}

type Suggestion = { case_id: string; title: string; distance_m: number; days_apart: number };
function Duplicates({ draft, onChoose }: { draft: Draft; onChoose: (id: string | undefined) => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  useEffect(() => {
    api<Suggestion[]>(`/orgs/${draft.org}/duplicate-suggestions`, { method: "POST", json: { lat: Number(draft.latitude), lon: Number(draft.longitude), observed_at: toReportBody(draft).observed_at } })
      .then(setItems, () => setItems([]));
  }, [draft.org, draft.latitude, draft.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items?.length) return null;
  return <fieldset><legend>Possibly related investigations nearby</legend>
    <p className="field-help">Your report is saved either way. A coordinator decides whether reports describe the same event; nothing is merged automatically.</p>
    <label className="checkbox-field"><input type="radio" name="dup" checked={!draft.suggestedCaseId} onChange={() => onChoose(undefined)}/><span>This is a new observation</span></label>
    {items.map(i => <label key={i.case_id} className="checkbox-field"><input type="radio" name="dup" checked={draft.suggestedCaseId === i.case_id} onChange={() => onChoose(i.case_id)}/>
      <span>It may be the same as “{i.title}” (about {i.distance_m} m away, {i.days_apart} day(s) apart)</span></label>)}</fieldset>;
}

type AiSuggestion = { observation_candidates: { code: string; description: string; input_reference: string }[]; suggested_questions: { code: string; text: string }[]; abstained: boolean };
const AI_CATEGORY: Record<string, string> = { foam_visible: "unusual_foam", colour_change_visible: "colour_change", visible_discharge_feature: "visible_discharge" };

/** Optional helper: proposes observable wording only. Nothing is added unless the person accepts it (B10). */
function AiAssist({ draft, onAccept }: { draft: Draft; onAccept: (patch: Partial<Draft>) => void }) {
  const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [result, setResult] = useState<{ run_id: string; suggestion: AiSuggestion } | null>(null); const [accepted, setAccepted] = useState<string[]>([]);
  async function ask() {
    setBusy(true); setNote(""); setResult(null);
    try {
      const media = (draft.photos ?? []).map(p => p.mediaId).filter(Boolean) as string[];
      setResult(await api(`/orgs/${draft.org}/ai/describe`, { method: "POST", json: { text: draft.description, media_ids: consent ? media : [], consent_photos: consent && media.length > 0 } }));
    } catch (e) { setNote((e as Error).message || "AI assistance is unavailable; you can continue manually."); }
    finally { setBusy(false); }
  }
  function accept(c: AiSuggestion["observation_candidates"][number]) {
    const category = AI_CATEGORY[c.code];
    onAccept({ description: (draft.description ? draft.description + " " : "") + c.description,
      categories: category && !draft.categories.includes(category) ? [...draft.categories, category] : draft.categories });
    const next = [...accepted, c.code]; setAccepted(next);
    api(`/orgs/${draft.org}/ai/runs/${result!.run_id}/review`, { method: "POST", json: { accepted_codes: next, edited: true } }).catch(() => undefined);
  }
  const uploaded = (draft.photos ?? []).some(p => p.mediaId);
  return <details className="ai-assist"><summary>Optional: suggest wording from your text{uploaded ? " and photos" : ""}</summary>
    <p className="field-help">Suggestions describe only what is visible or written. They never identify a pollutant, a cause or a safety risk, and nothing is added unless you accept it.</p>
    {uploaded ? <label className="checkbox-field"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>Send my uploaded photos (location data removed) to the AI provider for this suggestion</span></label> : null}
    <button type="button" className="button button-outline" disabled={busy || (!draft.description.trim() && !consent)} onClick={ask}>{busy ? "Asking…" : "Suggest wording"}</button>
    {note ? <p role="status" className="notice">{note}</p> : null}
    {result ? <div role="status">{result.suggestion.abstained || !result.suggestion.observation_candidates.length ? <p>No suggestion. You can continue manually.</p> :
      <ul>{result.suggestion.observation_candidates.map((c, i) => <li key={i}>{c.description} <span className="muted">(from {c.input_reference === "text" ? "your text" : "a photo"})</span>{" "}
        {accepted.includes(c.code) ? <strong>Added</strong> : <button type="button" className="button button-quiet" onClick={() => accept(c)}>Add to my report</button>}</li>)}</ul>}
      {result.suggestion.suggested_questions.map((q, i) => <p key={i} className="muted">{q.text}</p>)}</div> : null}
  </details>;
}
