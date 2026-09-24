import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "../../components/app-header";
import { MotionSettings } from "../../components/motion-settings";
import { PolicyDoc } from "../../components/policy-doc";
import { Footer } from "../../components/ui";

export const metadata: Metadata = { title: "Accessibility" };
export default function AccessibilityPage() {
  return <><AppHeader/><PolicyDoc eyebrow="Accessibility" title="A place for every contributor."
    intro={<p>Upstream is designed for keyboard navigation, readable forms, visible focus, and use on small screens. Our accessibility target is WCAG 2.2 AA; this statement is a commitment to improvement, not a claim of independent certification.</p>}
    aside={<div className="policy-settings"><p className="eyebrow">Your comfort</p><MotionSettings/></div>}
    sections={[
      { id: "navigate", title: "Navigate your way", body: <ul className="check-list"><li>Use the skip link to move directly to the main content.</li><li>All primary navigation and actions can be reached with a keyboard; focus is always visible.</li><li>On a smaller screen, the Menu button opens the primary navigation.</li><li>You can reduce motion at any time; nothing depends on it.</li></ul> },
      { id: "maps", title: "Maps and evidence", body: <ul className="check-list"><li>Station lists are provided alongside maps and schematics.</li><li>Reach states use labels and patterns as well as colour.</li><li>Essential evidence stays available in text and tables, without requiring a map gesture.</li></ul> },
      { id: "barriers", title: "When something gets in the way", body: <><p>If a page or workflow prevents you from contributing, share the page address, the action you were trying to complete, and any assistive technology you use with your organization’s coordinator. Avoid including private case details in a public report.</p>
        <p>For a service interruption, check <Link href="/status">service status</Link>. You can learn about the <Link href="/how-it-works">investigation process</Link> without signing in.</p></> },
    ]}/><Footer/></>;
}
