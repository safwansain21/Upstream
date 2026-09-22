"use client";
import { createBrowserClient } from "@supabase/ssr";

export const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public fieldErrors?: Record<string, string>, public retryable = false) { super(message); }
}

/** Same-origin /api/v1 call with the current session. Errors keep the server's code; network failure is never success. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  if (init.json !== undefined) { headers.set("Content-Type", "application/json"); init.body = JSON.stringify(init.json); }
  if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
  let response: Response;
  try { response = await fetch(`/api/v1${path}`, { ...init, headers, cache: "no-store" }); }
  catch { throw new ApiError("NETWORK", "No connection to Upstream. Nothing was sent.", 0, undefined, true); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const e = body?.error;
    throw new ApiError(e?.code || "UNKNOWN", e?.message || `Request failed (${response.status}).`, response.status, e?.field_errors, e?.retryable);
  }
  return body.data as T;
}

export type Me = { user_id: string; profile: { display_name: string } | null; organizations: { id: string; name: string; example: boolean; status: string; capabilities: string[] }[] };

/** Only same-site relative paths; blocks open redirects like //evil.example. */
export function safeNext(value: string | null) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/app"; }
