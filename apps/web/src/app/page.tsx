import Link from "next/link";
import { AppHeader } from "../components/app-header";
import { Arrow } from "../components/brand";
import { Reveal } from "../components/reveal";
import { DuskScene } from "../components/scene/dusk-scene";
import { HeroRoute } from "../components/scene/hero-route";
import { Footer } from "../components/ui";

/** The landing story continues the hero's line: where a change enters, who reaches that water, who needs the evidence. */
export default function HomePage() {
  return <>
    <div className="landing-top"><DuskScene variant="hero" eager route={<HeroRoute note="A report begins with what you notice"/>}/><AppHeader/>
      <main id="main-content">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="hero-content">
            <h1 id="hero-title" className="enter">See a change.<br/>Follow it upstream.</h1>
            <p className="hero-subtitle enter enter-1">Turn local observations into a coordinated investigation.</p>
            <div className="hero-actions enter enter-2">
              <Link href="/report/new" className="button button-primary">Report an observation</Link>
              <Link href="/example" className="button button-outline">Explore an example</Link>
            </div>
          </div>
          <ol className="hero-process" aria-label="From report to review">
            <li><strong>Report</strong><span>Share what you see at a river, pond or lake.</span></li>
            <li><strong>Collect evidence</strong><span>Combine measurements, photos and local knowledge.</span></li>
            <li><strong>Review</strong><span>People examine the evidence to find what is possible.</span></li>
            <li className="unmapped-process"><strong>No mapped stream nearby?</strong><span><Link href="/report/new">You can still report an observation.</Link></span></li>
          </ol>
          <span className="scene-disclosure">Illustrative scene · not a real investigation map</span>
        </section>
      </main>
    </div>
    <div className="landing-story">
      <section className="story-spine section-shell" aria-labelledby="story-heading">
        <h2 id="story-heading" className="visually-hidden">What happens after a report</h2>
        <Reveal as="article" className="story-step" aria-labelledby="enter-heading">
          <span className="story-marker" aria-hidden="true"/>
          <p className="eyebrow amber">01 · The stream</p>
          <h3 id="enter-heading">Find where the change enters.</h3>
          <p>Reports from people who notice, and readings from trained monitors, narrow the stretches of stream where a change could have come in. A stretch that no longer fits the evidence is ruled out under stated assumptions, never declared fine. Those that still fit stay worth checking.</p>
          <p className="story-foot">Station by station · every assumption written down</p>
        </Reveal>
        <Reveal as="article" className="story-step" aria-labelledby="contact-heading">
          <span className="story-marker" aria-hidden="true"/>
          <p className="eyebrow amber">02 · People and animals</p>
          <h3 id="contact-heading">See who reaches that water.</h3>
          <p>Footpaths and swimming spots, grazing and drinking points, the habitats downstream: each layer is recorded with its source, so attention goes first to where people and animals come into contact with the water.</p>
          <ul className="story-layers" aria-label="Context layers"><li><span className="layer-line people"/>Public access</li><li><span className="layer-line animals"/>Animal access</li><li><span className="layer-line habitat"/>Habitat</li></ul>
        </Reveal>
        <Reveal as="article" className="story-step" aria-labelledby="share-heading">
          <span className="story-marker" aria-hidden="true"/>
          <p className="eyebrow amber">03 · The people who act</p>
          <h3 id="share-heading">Hand over evidence anyone can trace.</h3>
          <p>An expert reviews the evidence, then it goes to the environmental, public-health and wildlife agencies who can act, each record traceable to the observation or reading behind it, in the formats they already use.</p>
          <p className="story-formats"><span>Signed PDF</span><span>GeoJSON</span><span>CSV readings</span><span>FHIR R4 for health systems</span></p>
        </Reveal>
        <Reveal className="story-close">
          <p>Upstream diagnoses no one and makes no claim about health. It helps the right people look in the right place, sooner.</p>
          <Link href="/how-it-works" className="text-link">How an investigation unfolds <Arrow/></Link>
        </Reveal>
      </section>
      <section className="landing-example section-shell" aria-labelledby="example-heading">
        <Reveal className="landing-example-card">
          <div className="example-copy"><span className="badge origin-synthetic">Synthetic example</span>
            <h2 id="example-heading">A small stream.<br/>A shared investigation.</h2>
            <p>Follow Mill Brook from the first observation to a reviewable next step, computed by the real engine. See what happens when evidence is useful, uncertain, or revised.</p>
            <Link href="/example" className="button button-primary">Explore the investigation <Arrow/></Link></div>
          <svg className="example-trace" viewBox="0 0 520 260" aria-hidden="true"><path pathLength={1} d="M18 222 C120 210 160 170 232 150 S330 118 372 84 S460 40 506 30"/><path pathLength={1} className="branch" d="M372 84 C390 110 430 124 488 120"/><path pathLength={1} className="branch dashed" d="M232 150 C250 118 250 76 286 44"/><circle className="origin" cx="18" cy="222" r="6"/><circle cx="506" cy="30" r="4"/><circle cx="488" cy="120" r="4"/><circle cx="286" cy="44" r="4"/></svg>
        </Reveal>
      </section>
      <section className="landing-limits section-shell" aria-labelledby="limits-heading">
        <Reveal><h2 id="limits-heading">Better questions.<br/>Grounded decisions.</h2></Reveal>
        <Reveal className="limits-copy"><h3>What an observation can do</h3><p>A report can document a change, start a local case, and help organize the next useful evidence.</p>
          <h3>What it cannot tell you alone</h3><p>A photo does not identify a pollutant or establish water safety. Measurements, appropriate assumptions, and expert review are needed for interpretation.</p></Reveal>
      </section>
      <section className="community-invitation section-shell" aria-labelledby="community-heading">
        <h2 id="community-heading">Care about your local stream?<br/>There’s a place for you here.</h2>
        <Link href="/how-it-works#communities" className="button button-outline">Find your part <Arrow/></Link>
      </section>
    </div>
    <Footer/>
  </>;
}
