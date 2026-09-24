import Link from "next/link";
import { StatePage } from "../components/state-page";
export default function NotFound() {
  return <StatePage label="Page not found" title="This page is not available.">
    <p className="lead">The link may be incorrect, or the page may have moved.</p>
    <div className="button-row"><Link className="button button-primary" href="/">Back to home</Link><Link className="button button-outline" href="/example">Explore an example</Link></div>
  </StatePage>;
}
