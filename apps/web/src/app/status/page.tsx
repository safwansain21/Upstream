import type { Metadata } from "next";
import { AppHeader } from "../../components/app-header";
import { ServiceStatus } from "../../components/service-status";
import { Footer, PageIntro } from "../../components/ui";
export const metadata: Metadata = { title: "Service status" };
export default function StatusPage() { return <><AppHeader/><main id="main-content" className="page-shell"><PageIntro title="How things are running."><p>Current availability for this installation. Checks show service readiness, not the scientific validity of an investigation.</p></PageIntro><p className="status-explanation">Optional integrations may be unavailable. A local test inbox does not deliver email to an external recipient.</p><ServiceStatus/></main><Footer/></>; }
