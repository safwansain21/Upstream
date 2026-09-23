import Link from "next/link";
import { preload } from "react-dom";
import { AppHeader } from "../components/app-header";
import { Arrow } from "../components/brand";
import { ProcessSteps } from "../components/process-steps";
import { Footer, OriginBadge } from "../components/ui";

export default function HomePage() {
  preload("/upstream-dark/dusk-river-clean-plate.png", { as: "image", fetchPriority: "high" });
  return <>
    <div className="landing-top"><AppHeader/><main id="main-content">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="hero-content">
          <h1 id="hero-title">See a change.<br/>Follow it upstream.</h1>
          <p className="hero-subtitle">Turn local observations into a coordinated investigation.</p>
          <div className="hero-actions">
            <Link href="/report/new" className="button button-primary">Report an observation</Link>
            <Link href="/example" className="button button-outline">Explore an example</Link>
          </div>
        </div>
        <p className="hero-origin-note">A report begins with what you notice</p>
        <ol className="hero-process" aria-label="From report to review">
          <li><strong>Report</strong><span>Share what you see at a river, pond or lake.</span></li>
          <li><strong>Collect evidence</strong><span>Combine measurements, photos and local knowledge.</span></li>
          <li><strong>Review</strong><span>People examine the evidence to find what is possible.</span></li>
          <li className="unmapped-process"><strong>No mapped stream nearby?</strong><span><Link href="/report/new">You can still report an observation.</Link></span></li>
        </ol>
        <span className="scene-disclosure">Illustrative scene · not a real investigation map</span>
      </section>
      <section className="process-section section-shell" aria-labelledby="start-heading">
        <h2 id="start-heading">Start where you are.</h2>
        <div className="process-layout"><div className="process-main"><ProcessSteps/></div>
          <Link href="/report/new" className="unmapped-note"><div><h3>No mapped stream nearby?</h3><p>You can still report an observation.</p><span className="text-link">Start with what you know <Arrow/></span></div></Link>
        </div>
      </section>
      <section className="example-feature section-shell" aria-labelledby="example-heading">
        <div className="example-feature-intro"><OriginBadge/><h2 id="example-heading">A small stream.<br/>A shared investigation.</h2>
          <p>Follow a synthetic Mill Brook case from the first observation to a reviewable next step. See what happens when evidence is useful, uncertain, or revised.</p>
          <Link href="/example" className="button button-primary">Explore the investigation <Arrow/></Link></div>
        <div className="example-preview"><span className="preview-stream-name">Mill Brook</span>
          <svg viewBox="0 0 420 230" role="img" aria-label="Illustrative branching stream diagram"><path d="M65 25C65 85 135 80 145 120S215 140 226 170 241 197 259 220M355 24C320 70 315 84 310 109S244 133 226 170" stroke="var(--ice)" strokeWidth="25" fill="none"/><path d="M65 25C65 85 135 80 145 120S215 140 226 170 241 197 259 220M355 24C320 70 315 84 310 109S244 133 226 170" stroke="var(--river)" strokeWidth="3" fill="none"/>{[[65,25],[145,120],[355,24],[310,109],[226,170],[259,220]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r="6" fill={i===3 ? "var(--brand)" : "var(--surface)"} stroke="var(--ink)" strokeWidth="1.5"/>)}</svg>
          <div className="preview-note"><strong>What would help us learn more?</strong><span>Explore how evidence changes the next step.</span></div>
        </div>
      </section>
      <section className="limits-section section-shell"><div><h2>Better questions.<br/>Grounded decisions.</h2><p>Upstream connects the people who notice changes with the people who can investigate them.</p></div>
        <div className="limits-copy"><h3>What an observation can do</h3><p>A report can document a change, start a local case, and help organize the next useful evidence.</p><h3>What it cannot tell you alone</h3><p>A photo does not identify a pollutant or establish water safety. Measurements, appropriate assumptions, and expert review are needed for interpretation.</p><Link href="/how-it-works" className="text-link">Understand the process <Arrow/></Link></div>
      </section>
      <section className="community-invitation"><div className="section-shell"><h2>Care about your local stream?<br/>There’s a place for you here.</h2><Link href="/how-it-works#communities" className="button button-outline">Find your part <Arrow/></Link></div></section>
    </main></div><Footer/>
  </>;
}
