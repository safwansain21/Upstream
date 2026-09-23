import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={className} width="54" height="34" viewBox="0 0 54 34" fill="none" aria-hidden="true"><path d="M3 11C12 2 21 3 31 10S47 18 52 10M3 21C12 12 21 13 31 20S47 28 52 20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>;
}

export function Brand() {
  return <Link href="/" className="brand" aria-label="Upstream home"><BrandMark /><span>upstream</span></Link>;
}

export function Arrow({ className = "" }: { className?: string }) {
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
