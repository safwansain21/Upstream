"use client";
import { createElement, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

/**
 * Reveals its content once, the first time it scrolls into view (MOTION_SPEC: no replay on scroll back).
 * Content is visible without JavaScript and under reduced motion: the hidden state only applies while
 * html[data-motion="full"] and the element has not been seen yet.
 */
export function Reveal({ as = "div", className = "", children, ...rest }: { as?: "div" | "article" | "section" | "li" | "ol" | "ul"; className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return createElement(as, { ref, className: `reveal ${seen ? "is-visible" : ""} ${className}`.trim(), ...rest }, children);
}
