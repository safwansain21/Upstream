"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, supabase, type Me } from "./api";

/** Client redirect to sign-in. Authorization is enforced by the API/RLS; this only avoids rendering empty shells. */
export function useSignedIn() {
  const router = useRouter(); const path = usePathname(); const [ready, setReady] = useState(false);
  useEffect(() => {
    const toSignIn = () => router.replace(`/sign-in?next=${encodeURIComponent(path)}`);
    supabase.auth.getSession().then(({ data }) => data.session ? setReady(true) : toSignIn());
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) toSignIn(); });
    return () => data.subscription.unsubscribe();
  }, [router, path]);
  return ready;
}

export function useMe(enabled = true) { return useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me"), enabled }); }

export function useOrg() {
  const { org } = useParams<{ org: string }>();
  const membership = useMe().data?.organizations.find(o => o.id === org);
  const can = (capability: string) => !!membership?.capabilities.includes(capability); // display only; the API enforces
  return { org, membership, can };
}
