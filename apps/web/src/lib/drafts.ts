"use client";
import Dexie, { type Table } from "dexie";

/** Report drafts on this device, partitioned by account. Local storage is not encryption. */
export type Draft = {
  id: string;            // UUIDv7; doubles as report client_id and idempotency key
  account: string;       // auth user id, or "guest" until sign-in
  org: string;
  step: 1 | 2 | 3;
  status: "device_saved" | "submitting" | "server_received" | "failed";
  categories: string[];
  description: string;
  observedAt: string;    // local datetime-local value
  timezone: string;
  landmark: string;
  latitude: string;
  longitude: string;
  accuracy: string;
  method: "landmark" | "gps" | "manual" | "pin";
  localName: string;
  unmapped: boolean;
  publicVisibility: boolean;
  keepOriginals: boolean;
  suggestedCaseId?: string; // citizen thinks it may match; a coordinator decides, nothing merges automatically
  photos: Photo[];
  error?: string;
  result?: { id: string; case_id: string; org_id: string };
  updatedAt: number;
};

export type Photo = { id: string; name: string; type: string; size: number; blob: Blob; mediaId?: string; error?: string };
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

class DraftDb extends Dexie {
  drafts!: Table<Draft, string>;
  constructor() { super("upstream"); this.version(1).stores({ drafts: "id, account, updatedAt" }); }
}
export const db = new DraftDb();

export function uuidv7() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let ms = Date.now();
  for (let i = 5; i >= 0; i--) { bytes[i] = ms % 256; ms = Math.floor(ms / 256); }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function newDraft(org: string): Draft {
  const now = new Date(); now.setSeconds(0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return { id: uuidv7(), account: "guest", org, step: 1, status: "device_saved", categories: [], description: "", observedAt: local,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, landmark: "", latitude: "", longitude: "", accuracy: "", method: "landmark",
    localName: "", unmapped: false, publicVisibility: false, keepOriginals: false, photos: [], updatedAt: Date.now() };
}

/** Guest drafts become the signed-in account's on this device; another account's drafts are never touched (H03). */
export async function claimGuestDrafts(account: string) {
  await db.drafts.where("account").equals("guest").modify({ account });
}

/** Server body; client times never authorize anything, observed_at keeps the original offset. */
export function toReportBody(d: Draft) {
  const observed = new Date(d.observedAt);
  const offset = -observed.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const hasPoint = d.latitude !== "" && d.longitude !== "";
  return {
    client_id: d.id, categories: d.categories, description: d.description.trim(),
    observed_at: `${d.observedAt}:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`, timezone: d.timezone,
    landmark: d.landmark.trim(), latitude: hasPoint ? Number(d.latitude) : null, longitude: hasPoint ? Number(d.longitude) : null,
    accuracy_m: hasPoint && d.accuracy ? Number(d.accuracy) : null, location_method: hasPoint ? d.method : "landmark",
    location_precision: hasPoint ? "approximate" : "unresolved", local_name: d.localName.trim() || null, unmapped: d.unmapped,
    public_visibility: d.publicVisibility, suggested_case_id: d.suggestedCaseId || null, media_ids: (d.photos ?? []).map(p => p.mediaId).filter(Boolean), new_observation: true,
  };
}

/** Mirrors server rules so errors show before sending; the server remains authoritative. */
export function validate(d: Draft, step: number): Record<string, string> {
  const e: Record<string, string> = {};
  if (step >= 1) {
    if (!d.categories.length && d.description.trim().length < 10) e.description = "Choose what you noticed, or describe it in at least 10 characters.";
    if (d.description.length > 2000) e.description = "Keep the description under 2000 characters.";
    if (!d.observedAt || Number.isNaN(new Date(d.observedAt).getTime())) e.observedAt = "Enter when you made the observation.";
    else if (new Date(d.observedAt).getTime() > Date.now() + 5 * 60000) e.observedAt = "The observation time cannot be in the future.";
  }
  if (step >= 2) {
    const hasLat = d.latitude !== "", hasLon = d.longitude !== "";
    if (hasLat !== hasLon) e.latitude = "Enter both latitude and longitude, or neither.";
    if (hasLat && !(Math.abs(Number(d.latitude)) <= 90)) e.latitude = "Latitude must be between -90 and 90.";
    if (hasLon && !(Math.abs(Number(d.longitude)) <= 180)) e.longitude = "Longitude must be between -180 and 180.";
    if (!hasLat && !d.landmark.trim()) e.landmark = "Describe a landmark, use your location, or enter coordinates.";
  }
  return e;
}
