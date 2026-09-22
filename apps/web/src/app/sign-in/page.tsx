"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppHeader } from "../../components/app-header";
import { InlineError, PageIntro } from "../../components/ui";
import { safeNext, supabase } from "../../lib/api";

function SignIn() {
  const params = useSearchParams(); const router = useRouter();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [sent, setSent] = useState(false);
  async function withPassword(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message); else router.replace(next);
  }
  async function withLink() {
    if (!email) { setError("Enter your email address first."); return; }
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }
  return <main id="main-content" className="page-shell"><PageIntro title="Sign in"><p>Your saved drafts stay on this device while you sign in.</p></PageIntro>
    <form className="surface stack" onSubmit={withPassword} noValidate>
      {error ? <InlineError>{error}</InlineError> : null}
      {sent ? <p role="status" className="notice">Check your email for a sign-in link. Your draft is kept on this device.</p> : null}
      <div className="form-field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="password">Password <span className="muted">(not needed for an email link)</span></label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></div>
      <div className="button-row"><button className="button button-primary" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button><button type="button" className="button button-outline" disabled={busy} onClick={withLink}>Email me a sign-in link</button></div>
      <p className="field-help">New to Upstream? The email link creates your account once you verify your address.</p>
    </form></main>;
}
export default function Page() { return <><AppHeader/><Suspense><SignIn/></Suspense></>; }
