import type { Metadata } from "next";
import { AppHeader } from "../../components/app-header";
import { ServiceStatus } from "../../components/service-status";
import { Footer, PageIntro } from "../../components/ui";

export const metadata: Metadata = { title: "Service status" };
export default function StatusPage() {
  return <><AppHeader/><main id="main-content" className="page-shell status-page">
    <PageIntro title="How things are running."><p>Checks show service readiness, not the scientific validity of an investigation.</p></PageIntro>
    <ServiceStatus/></main><Footer/></>;
}
