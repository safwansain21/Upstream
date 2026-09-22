import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={className} width="44" height="52" viewBox="0 0 44 52" fill="none" aria-hidden="true"><path d="M32 48C25 39 18 41 17 31C16 22 24 16 21 5M17 31C11 25 9 23 3 24M18 25C23 25 28 21 32 14M19 17C12 15 12 9 10 6M21 6L21 2" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export function Brand() {
  return <Link href="/" className="brand" aria-label="Upstream home"><BrandMark /><span>upstream</span></Link>;
}

export function Arrow({ className = "" }: { className?: string }) {
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
