import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { Reveal } from "../../components/reveal";
import { DuskScene } from "../../components/scene/dusk-scene";
import { SceneRoute, type Stop } from "../../components/scene/scene-route";
import { Footer, MarginLine } from "../../components/ui";

export const metadata: Metadata = { title: "How it works" };

const STAGES: [string, string][] = [["Report", "Describe what changed."], ["Locate", "A mapped stream is optional."], ["Collect", "Qualified monitors use verified instruments."],
  ["Review", "Experts assess evidence and assumptions."], ["Revise & share", "New evidence may change a conclusion."]];
const STOPS: Stop[] = [[200, 640], [480, 612], [780, 562], [1076, 512], [1350, 452]].map(([x, y], i) =>
  ({ x, y, tone: i === 0 ? "origin" : "done", label: <><span className="stop-index">0{i + 1}</span> {STAGES[i][0]}</>, detail: STAGES[i][1] }));

export default function HowItWorksPage() {
  return <>
    <div className="screen-top"><DuskScene variant="screen" route={<SceneRoute stops={STOPS} tail={[{ x: 1470, y: 428 }]}/>}/><AppHeader scene={false}/>
      <main id="main-content" className="how-hero">
        <div className="how-hero-copy">
          <h1 className="enter">One observation.<br/>A shared next step.</h1>
          <p className="lead enter enter-1">Turn local observations into a coordinated investigation. Different people. Clear steps. A clearer picture.</p>
          <div className="button-row enter enter-2"><Link className="button button-primary" href="/report/new">Report an observation</Link><Link className="button button-outline" href="/example">Explore an example</Link></div>
        </div>
        <MarginLine>People notice first. Evidence decides what is next.</MarginLine>
        <ol className="stage-list" aria-label="The investigation process">{STAGES.map(([t, d], i) => <li key={t}><span className="stop-index">0{i + 1}</span><strong>{t}</strong><span>{d}</span></li>)}</ol>
      </main>
    </div>
    <section id="communities" className="roles section-shell" aria-labelledby="roles-heading">
      <Reveal className="roles-intro"><h2 id="roles-heading">Different skills.<br/>A common purpose.</h2><p>Observers, monitors and experts each do the part they are qualified for, and every decision stays connected to its evidence.</p></Reveal>
      <Reveal as="ul" className="role-list stagger">
        <li><RoleGlyph kind="notice"/><h3>Notice &amp; contribute</h3><p>Describe what you observed, when, and where. A photo is welcome but optional. A coordinator reviews the report and connects it to a local investigation.</p></li>
        <li><RoleGlyph kind="collect"/><h3>Coordinate &amp; collect</h3><p>Coordinators check what is known and organize feasible work. Qualified monitors collect traceable measurements with the right instruments and protocols.</p></li>
        <li><RoleGlyph kind="review"/><h3>Review &amp; revise</h3><p>Qualified reviewers evaluate evidence and assumptions. Decisions remain connected to their records, and can change when new evidence arrives.</p></li>
      </Reveal>
      <Reveal className="principles">
        <h2>Evidence first.<br/>Uncertainty visible.</h2>
        <p className="lead">A photo can document a change. It cannot identify a pollutant or establish water safety.</p>
        <p>Conductivity alone does not identify a chemical or prove a source. Source-area analysis needs a reviewed network, comparable measurements and explicit uncertainty bounds. When those are missing, the investigation stays open and the next step is to build that foundation.</p>
        <p>A reach that remains under consideration is not proven responsible. An excluded reach is incompatible under stated assumptions, not proven clean. New evidence can expand the area under consideration.</p>
        <Link href="/example" className="text-link">See how an investigation changes <Arrow/></Link>
      </Reveal>
    </section>
    <section className="community-invitation section-shell" aria-labelledby="start-heading">
      <div className="stack"><h2 id="start-heading">Start with what you can safely observe.</h2>
        <p className="field-guidance">Stay on safe, permitted access routes. Do not enter the water or approach a suspected hazard to make a report. For an immediate threat, contact the appropriate local emergency service.</p></div>
      <Link className="button button-outline" href="/report/new">Make a report <Arrow/></Link>
    </section>
    <Footer/>
  </>;
}

/** Fine line glyphs for the three roles, drawn in the same hairline as the river lines. */
function RoleGlyph({ kind }: { kind: "notice" | "collect" | "review" }) {
  return <svg className="role-glyph" viewBox="0 0 96 64" fill="none" aria-hidden="true">
    <path d="M4 56c16-3 22-9 38-9s26 7 50 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
    {kind === "notice" ? <><circle cx="38" cy="16" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M38 22v14l-9 12M38 30l12 8M38 36l8 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="62" cy="46" r="3" fill="var(--amber)"/></>
      : kind === "collect" ? <><circle cx="44" cy="12" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M44 18v18l-7 14M44 36l7 14M44 26l14 6M58 32v20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M55 20h6v8h-6z" stroke="var(--amber)" strokeWidth="1.2"/></>
      : <><circle cx="34" cy="16" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M34 22v12l-6 14M34 30l14 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M50 30h22v14H50zM46 46h30" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="m55 40 5-5 4 3 5-5" stroke="var(--amber)" strokeWidth="1.2" strokeLinecap="round"/></>}
  </svg>;
}
