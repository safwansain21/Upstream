"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatePage } from "../components/state-page";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  useEffect(() => { setOffline(!navigator.onLine); }, []);
  return <StatePage label={offline ? "Connection unavailable" : "Something went wrong"} title="This page could not load.">
    <p className="lead">{offline ? "You appear to be offline. Check your connection and try again." : "We could not load the information needed for this page. Try again, or check service availability."} A failed request does not mean your work was submitted. Drafts saved on this device are still here.</p>
    <div className="button-row"><button type="button" className="button button-primary" onClick={reset}>Try again</button><Link className="button button-outline" href="/status">Service status</Link></div>
  </StatePage>;
}
