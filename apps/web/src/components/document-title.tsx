"use client";
import { useEffect } from "react";

/** Meaningful per-route document titles for client-rendered pages (announced on navigation). */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => { document.title = `${title} · Upstream`; }, [title]);
  return null;
}
