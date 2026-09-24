import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "../../components/app-header";
import { PolicyDoc } from "../../components/policy-doc";
import { Footer } from "../../components/ui";

export const metadata: Metadata = { title: "Privacy" };
export default function PrivacyPage() {
  return <><AppHeader/><PolicyDoc eyebrow="Privacy" title="Your observations. Handled with care."
    intro={<p>Reports can include a description, location, time, and optional photographs. Signed-in activity is connected to your account and organization so a coordinator can review contributions and follow up.</p>}
    aside={<p className="margin-line">Private by default. Shared on purpose.</p>}
    sections={[
      { id: "who-can-see", title: "Who can see a report", body: <p>Access to working records is controlled by organization membership and assigned capabilities. A shared evidence package has a separate access scope. Public examples are explicitly synthetic; they are not a public feed of private contributions.</p> },
      { id: "locations-photos", title: "Locations and photographs", body: <p>Only include the detail needed to describe the observation. Avoid faces, vehicle plates, private documents, and sensitive locations in photos. A precise location can reveal where you were. Check the report before submitting and use a nearby landmark when that better fits the observation. Location data embedded in photos is removed from shared copies.</p> },
      { id: "drafts", title: "Drafts on this device", body: <p>Drafting and offline features may retain unsent information in this browser. Use a personal device when possible. Browser storage can be cleared or evicted, and it is not encryption; keep your own copy of important field records.</p> },
      { id: "corrections", title: "Corrections, access, and retention", body: <p>Contact the organization handling your case to request a correction, access to your information, or a privacy review. A reviewed record may need a linked correction to preserve the investigation history. Retention and deletion depend on that organization’s documented obligations.</p> },
      { id: "external", title: "External services", body: <p>Configured providers may support sign-in, storage, maps, or other integrations. Availability is shown in <Link href="/status">service status</Link>. An organization should provide its operator contact, provider details, and retention schedule before collecting live field reports.</p> },
    ]}/><Footer/></>;
}
