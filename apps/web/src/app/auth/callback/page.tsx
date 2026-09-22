"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InlineError, LoadingState } from "../../../components/ui";
import { safeNext, supabase } from "../../../lib/api";

export default function AuthCallback() {
  const router = useRouter(); const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    (code ? supabase.auth.exchangeCodeForSession(code) : supabase.auth.getSession())
      .then(({ error }) => error ? setError(error.message) : router.replace(safeNext(params.get("next"))));
  }, [router]);
  return <main id="main-content" className="page-shell">{error ? <InlineError>{error} <a href="/sign-in">Try signing in again.</a></InlineError> : <LoadingState label="Verifying your sign-in…"/>}</main>;
}
