"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/api";
import { db, type Draft } from "../lib/drafts";
import { claim, sendDraft, STALE_MS } from "../lib/submit";

/**
 * Connection banner and foreground sync of this account's queued drafts (H02, H03, H05, H12).
 * Only drafts owned by the signed-in account are ever sent; nothing is promised to sync in the background.
 */
export function OfflineStatus() {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState<Draft[]>([]);
  const [message, setMessage] = useState("");
  const running = useRef(false);

  async function load() {
    const { data } = await supabase.auth.getSession();
    const account = data.session?.user.id;
    if (account) await db.drafts.where("account").equals(account).filter(d => d.status === "submitting" && Date.now() - d.updatedAt > STALE_MS)
      .modify({ status: "queued" }).catch(() => undefined);  // interrupted sends are retried, never lost
    setQueued(account ? await db.drafts.where("account").equals(account).filter(d => d.status === "queued").toArray().catch(() => []) : []);
    return account;
  }

  async function syncNow() {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    try {
      const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));  // session and permissions first
      const account = data.session?.user.id;
      if (!account) { setMessage("Sign in again to send drafts saved on this device."); return; }
      await load();  // interrupted sends become queued again before sending
      const drafts = await db.drafts.where("account").equals(account).filter(d => d.status === "queued").toArray();
      let sent = 0, stopped = "";
      for (const d of drafts) {
        const claimed = await claim(d.id, ["queued"]);
        if (!claimed) continue;
        const outcome = await sendDraft(claimed, patch => db.drafts.update(d.id, { ...patch, updatedAt: Date.now() }));
        window.dispatchEvent(new Event("upstream-drafts"));
        if (outcome.ok) sent++;
        else if (outcome.error.status === 403) stopped = "Automatic sending stopped: your membership or access changed. Your draft is kept on this device.";
      }
      setMessage(stopped || (sent ? `${sent} saved report${sent === 1 ? " was" : "s were"} sent.` : ""));
    } finally { running.current = false; load(); }
  }

  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) syncNow(); else load(); };
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update); window.addEventListener("upstream-drafts", load);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); window.removeEventListener("upstream-drafts", load); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (online && !queued.length && !message) return null;
  return <div className="page-banner" role="status" aria-live="polite">
    {!online ? <p><strong>You are offline.</strong> Drafts save on this device. Approving, assigning, publishing maps and sending packages need a connection.</p> : null}
    {queued.length ? <p>{queued.length} report{queued.length === 1 ? "" : "s"} saved on this device, not submitted yet: {queued.map(d => <Link key={d.id} className="text-link" href={`/report/${d.id}/edit`}> open draft</Link>)}.
      {online ? <button className="button button-quiet" onClick={syncNow}>Send now</button> : null}</p> : null}
    {message ? <p>{message}</p> : null}
  </div>;
}
