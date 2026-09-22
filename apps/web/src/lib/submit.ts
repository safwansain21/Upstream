"use client";
import { api, ApiError } from "./api";
import { db, toReportBody, type Draft, type Photo, type ReadingSet } from "./drafts";

export type Sent = { id: string; case_id: string; org_id: string };
export const STALE_MS = 120_000;
export const QUEUED_MESSAGE = "Saved on this device. Not submitted yet. It will be sent when you are back online while Upstream is open.";

/** Send a reading set saved on this device with its original client_id and task version; the server decides eligibility (D12). */
export async function sendReadings(r: ReadingSet) {
  try {
    const result = await api<{ readings: { eligible: boolean; reasons: string[] }[] }>(`/orgs/${r.org}/tasks/${r.task}/readings`, { method: "POST", json: r.body });
    await db.readings.delete(r.id);
    return { ok: true as const, result };
  } catch (e) {
    const err = e as ApiError;
    if (err.code !== "NETWORK") await db.readings.update(r.id, { error: err.message, updatedAt: Date.now() }); // kept for the monitor to see
    return { ok: false as const, error: err };
  }
}

/** Claim a draft for sending exactly once across tabs/components (compare-and-set on its status). */
export async function claim(id: string, from: Draft["status"][]) {
  return db.transaction("rw", db.drafts, async () => {
    const d = await db.drafts.get(id);
    // A send interrupted by a closed tab leaves "submitting" behind; after 2 minutes it may be claimed again (same idempotency key).
    const stale = d?.status === "submitting" && Date.now() - d.updatedAt > STALE_MS;
    if (!d || (!from.includes(d.status) && !stale)) return null;
    await db.drafts.update(id, { status: "submitting", error: undefined, updatedAt: Date.now() });
    return { ...d, status: "submitting" as const };
  });
}

/**
 * Send one draft: photos first (their ids are persisted so a retry reuses them), then the report with the draft's
 * UUIDv7 as idempotency key, so a repeated send returns the original result instead of a second report.
 * Never reports success before the server accepted the report.
 */
export async function sendDraft(draft: Draft, save: (patch: Partial<Draft>) => void | Promise<unknown>): Promise<{ ok: true; result: Sent } | { ok: false; error: ApiError }> {
  const photos: Photo[] = [...(draft.photos ?? [])];
  for (let i = 0; i < photos.length; i++) {
    if (photos[i].mediaId) continue;
    await save({ error: `Uploading photo ${i + 1} of ${photos.length}…` });
    const form = new FormData(); form.append("file", photos[i].blob, photos[i].name); form.append("keep_original", String(draft.keepOriginals));
    try {
      const r = await api<{ id: string }>(`/orgs/${draft.org}/uploads`, { method: "POST", body: form });
      photos[i] = { ...photos[i], mediaId: r.id, error: undefined };
      await save({ photos });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "NETWORK") { await save({ status: "queued", error: QUEUED_MESSAGE }); return { ok: false, error: err }; }
      photos[i] = { ...photos[i], error: err.message };
      await save({ photos, status: "device_saved", error: "A photo could not be uploaded. Retry, or remove it and submit without it. Nothing else was lost." });
      return { ok: false, error: err };
    }
  }
  try {
    const result = await api<Sent>(`/orgs/${draft.org}/reports`, { method: "POST", json: toReportBody({ ...draft, photos }), idempotencyKey: draft.id });
    await save({ status: "server_received", result, error: undefined });
    return { ok: true, result };
  } catch (e) {
    const err = e as ApiError;
    await save(err.code === "NETWORK" ? { status: "queued", error: QUEUED_MESSAGE }
      : { status: err.retryable ? "device_saved" : "failed", error: err.message });
    return { ok: false, error: err };
  }
}
