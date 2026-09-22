"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, supabase } from "../lib/api";
import { claimGuestDrafts, db, toReportBody, validate, type Draft } from "../lib/drafts";
import { InlineError, LoadingState } from "./ui";

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
  async function submit() {
    const found = validate(draft!, 3); setErrors(found);
    if (Object.keys(found).length) { requestAnimationFrame(() => summary.current?.focus()); return; }
    if (!account) { router.push(`/sign-in?next=${encodeURIComponent(`/report/${draftId}/edit`)}`); return; }
    update({ status: "submitting", error: undefined });
    try {
      const result = await api<{ id: string; case_id: string; org_id: string }>(`/orgs/${draft!.org}/reports`, { method: "POST", json: toReportBody(draft!), idempotencyKey: draft!.id });
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
    <p className="muted" role="status">{draft.status === "submitting" ? "Sending to Upstream…" : draft.error ? draft.error : "Saved on this device. Not submitted yet."}</p>
    {notice ? <p className="notice" role="status">{notice}</p> : null}
    {Object.keys(errors).length ? <div className="inline-error" role="alert" tabIndex={-1} ref={summary}><strong>Please fix:</strong><ul>{Object.entries(errors).map(([k, v]) => <li key={k}><a href={`#${k}`}>{v}</a></li>)}</ul></div> : null}

    {draft.step === 1 ? <section className="surface stack" aria-labelledby="step-heading"><h2 id="step-heading" tabIndex={-1} ref={heading}>What did you notice?</h2>
      <fieldset id="categories"><legend>Choose any that fit (optional)</legend>{CATEGORIES.map(([code, label]) => <label className="checkbox-field" key={code}><input type="checkbox" checked={draft.categories.includes(code)} onChange={e => update({ categories: e.target.checked ? [...draft.categories, code] : draft.categories.filter(c => c !== code) })}/><span>{label}</span></label>)}</fieldset>
      <div className="form-field"><label htmlFor="description">Describe your observation</label><textarea id="description" rows={5} maxLength={2000} value={draft.description} aria-invalid={!!errors.description} aria-describedby={described("description", "description-help")} onChange={e => update({ description: e.target.value })}/><p className="field-help" id="description-help">{draft.description.length} / 2000. What did you see, where and when? A photo or description records what you saw; it does not establish the cause.</p>{err("description")}</div>
      <div className="form-field"><label htmlFor="observedAt">When did you observe it? <span className="muted">({draft.timezone})</span></label><input id="observedAt" type="datetime-local" value={draft.observedAt} aria-invalid={!!errors.observedAt} aria-describedby={described("observedAt")} onChange={e => update({ observedAt: e.target.value })}/>{err("observedAt")}</div>
      <p className="field-help">Photos can be added once photo upload is enabled for this workspace. A text-only report is complete.</p>
      <div className="button-row"><button type="button" className="button button-primary" onClick={() => go(2)}>Continue to location</button></div></section> : null}

    {draft.step === 2 ? <section className="surface stack" aria-labelledby="step-heading"><h2 id="step-heading" tabIndex={-1} ref={heading}>Where was it?</h2>
      <p className="field-guidance">Use public or approved access points. Do not enter unsafe or private land to make a report.</p>
      <div className="button-row"><button type="button" className="button button-outline" disabled={geoBusy} onClick={locate}>{geoBusy ? "Finding your location…" : "Use my current location"}</button>{hasPoint ? <button type="button" className="button button-quiet" onClick={() => update({ latitude: "", longitude: "", accuracy: "", method: "landmark" })}>Clear coordinates</button> : null}</div>
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
        {draft.localName || draft.unmapped ? <><dt>Stream</dt><dd>{draft.localName || "Unnamed"}{draft.unmapped ? " · not on the map" : ""}</dd></> : null}</dl>
      <label className="checkbox-field"><input type="checkbox" checked={draft.publicVisibility} onChange={e => update({ publicVisibility: e.target.checked })}/><span>Allow a generalized public summary of this report</span></label>
      <p className="field-help">Private to the receiving organization by default. Precise location and your contact details are never public.</p>
      {!account ? <p className="notice">You will be asked to sign in and verify your email before the report is sent. Your draft stays on this device.</p> : null}
      <div className="button-row"><button type="button" className="button button-outline" onClick={() => go(2)}>Back</button><button type="button" className="button button-quiet" onClick={() => setNotice("Draft saved on this device.")}>Save draft</button><button type="button" className="button button-primary" disabled={draft.status === "submitting"} onClick={submit}>{draft.status === "submitting" ? "Submitting…" : draft.error ? "Retry submission" : "Submit report"}</button></div></section> : null}
  </div>;
}
