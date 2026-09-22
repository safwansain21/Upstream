"use client";
import Link from "next/link";
import { AppHeader } from "../components/app-header";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <><AppHeader/><main id="main-content" className="error-page"><h1>This page could not load.</h1><p>We could not load the information needed for this page. Try again, or check service availability. A failed request does not mean your work was submitted.</p><div className="button-row"><button type="button" className="button button-primary" onClick={reset}>Try again</button><Link className="button button-outline" href="/status">Service status</Link></div></main></>; }
