import Link from "next/link";
import { AppHeader } from "../components/app-header";
import { Footer } from "../components/ui";
export default function NotFound() { return <><AppHeader/><main id="main-content" className="error-page"><h1>This path ends here.</h1><p>The page could not be found, or this link is no longer available. You can return home or explore an example investigation.</p><div className="button-row"><Link className="button button-primary" href="/">Back to home</Link><Link className="button button-outline" href="/example">Explore an example</Link></div></main><Footer/></>; }
