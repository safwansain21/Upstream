"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { DocumentTitle } from "../../components/document-title";
import { EyeIcon, LockIcon } from "../../components/icons";
import { DuskScene } from "../../components/scene/dusk-scene";
import { SceneRoute, type Stop } from "../../components/scene/scene-route";
import { InlineError } from "../../components/ui";
import { safeNext, supabase } from "../../lib/api";

function SignIn() {
  const params = useSearchParams(); const router = useRouter();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [reveal, setReveal] = useState(false);
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
  return <main id="main-content" className="access-page"><DocumentTitle title="Sign in"/>
    <div className="access-intro enter"><h1>Welcome back<br/>to Upstream.</h1><p>Continue an investigation or follow your contribution. Your saved drafts stay on this device while you sign in.</p></div>
    <form className="access-panel enter enter-1" onSubmit={withPassword} noValidate aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading" className="visually-hidden">Sign in</h2>
      {error ? <InlineError>{error}</InlineError> : null}
      {sent ? <p role="status" className="notice verified">Check your email for a sign-in link. Your draft is kept on this device.</p> : null}
      <div className="form-field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}/></div>
      <div className="form-field"><label htmlFor="password">Password <span className="subtle">(not needed for an email link)</span></label>
        <div className="password-field"><input id="password" type={reveal ? "text" : "password"} autoComplete="current-password" placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)}/>
          <button type="button" className="icon-button" aria-pressed={reveal} aria-label={reveal ? "Hide password" : "Show password"} onClick={() => setReveal(r => !r)}>
            <EyeIcon size={20} off={!reveal}/></button></div></div>
      <button className="button button-primary button-block" disabled={busy || !password}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="access-alt">Prefer not to use a password? <button type="button" className="text-link" disabled={busy} onClick={withLink}>Email me a sign-in link</button></p>
      <hr/>
      <p className="access-new">New here? <Link className="text-link" href="/report/new">Report an observation <Arrow/></Link><br/><span className="subtle">The email link creates your account once you verify your address.</span></p>
    </form>
    <p className="access-privacy"><LockIcon size={18}/> Your information stays private and is used only to support your investigations on Upstream.</p>
  </main>;
}
/* starts on the open water left of the form (never in the reeds), passes behind it, and winds upstream on the right */
const ROUTE: Stop[] = [{ x: 470, y: 420, tone: "origin" }, ...[[522, 446], [572, 474], [620, 500], [700, 530], [830, 562], [1063, 547], [1278, 513]].map(([x, y]) => ({ x, y, ghost: true })),
  { x: 1410, y: 477 }, { x: 1330, y: 447, ghost: true }, { x: 1258, y: 436 }, { x: 1150, y: 414, ghost: true }, { x: 1228, y: 396 }];
export default function Page() { return <div className="screen-top"><DuskScene variant="screen" route={<SceneRoute stops={ROUTE} duration={2.4}/>}/><AppHeader scene={false}/><Suspense><SignIn/></Suspense></div>; }
