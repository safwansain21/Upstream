import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { CompassIcon, LifebuoyIcon, PinIcon } from "../../components/icons";
import { MotionSettings } from "../../components/motion-settings";
import { SectionTabs } from "../../components/section-tabs";
import { Footer } from "../../components/ui";

export const metadata: Metadata = { title: "Accessibility" };
export default function AccessibilityPage() {
  return <><AppHeader/><main id="main-content" className="a11y-page">
    <header className="a11y-hero enter">
      <div className="a11y-hero-copy"><p className="eyebrow">Accessibility</p><h1>A place for every contributor.</h1>
        <p className="lead">Upstream is designed for keyboard navigation, readable forms, visible focus, and use on small screens, so that everyone who notices a change can take part.</p></div>
      <div className="a11y-comfort"><MotionSettings/></div>
    </header>
    <SectionTabs sections={[["navigate", "Navigate your way"], ["maps", "Maps and evidence"], ["barriers", "When something gets in the way"]]}/>
    <div className="a11y-columns">
      <section id="navigate" aria-labelledby="navigate-h"><h2 id="navigate-h"><CompassIcon size={40}/>Navigate your way</h2>
        <ul className="check-list"><li>Use the skip link to move directly to the main content.</li><li>All primary navigation and actions can be reached with a keyboard; focus is always visible.</li><li>On a smaller screen, the Menu button opens the primary navigation.</li><li>You can reduce motion at any time; nothing depends on it.</li></ul></section>
      <section id="maps" aria-labelledby="maps-h"><h2 id="maps-h"><PinIcon size={40}/>Maps and evidence</h2>
        <ul className="check-list"><li>Station lists are provided alongside maps and schematics.</li><li>Reach states use labels and patterns as well as colour.</li><li>Essential evidence stays available in text and tables, without requiring a map gesture.</li></ul>
        <Link className="button button-outline" href="/example">Explore an example <Arrow/></Link></section>
      <section id="barriers" aria-labelledby="barriers-h"><h2 id="barriers-h"><LifebuoyIcon size={40}/>When something gets in the way</h2>
        <p>If a page or workflow prevents you from contributing, share the page address, the action you were trying to complete, and any assistive technology you use with your organization’s coordinator. Avoid including private case details in a public report.</p>
        <p>For a service interruption, check <Link href="/status">service status</Link>. You can learn about the <Link href="/how-it-works">investigation process</Link> without signing in.</p>
        <div className="a11y-approach"><h3>Our approach</h3><p>Our accessibility target is WCAG 2.2 AA. This statement is a commitment to improvement, not a claim of independent certification.</p></div></section>
    </div>
  </main><Footer/></>;
}
