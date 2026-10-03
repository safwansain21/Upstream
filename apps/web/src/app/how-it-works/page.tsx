import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { Reveal } from "../../components/reveal";
import { DuskScene } from "../../components/scene/dusk-scene";
import { LightRoute } from "../../components/scene/light-route";
import { trace, type P } from "../../components/scene/route-geometry";
import { Footer, MarginLine } from "../../components/ui";

export const metadata: Metadata = { title: "How it works" };

const STAGES: [string, string][] = [["Report", "Describe what changed."], ["Locate", "A mapped stream is optional."], ["Collect", "Qualified monitors use verified instruments."],
  ["Review", "Experts assess evidence and assumptions."], ["Revise & share", "New evidence may change a conclusion."]];
/* The stage spine is laid out in its own box below the actions (x in thousandths of the width, y in px), never in scene
 * coordinates, so its labels cannot drift onto the heading or the buttons at any viewport size. */
const SPINE_H = 250;
const STOPS: P[] = [[50, 212], [245, 192], [440, 156], [640, 118], [855, 60]];
const SPINE: P[] = [STOPS[0], [150, 214], STOPS[1], [345, 190], STOPS[2], [543, 150], STOPS[3], [748, 108], STOPS[4], [930, 48], [985, 50]];
const DRAW = { start: .7, dur: 2.3 };
const spineTrace = trace(SPINE, undefined, 20);
const arrival = (p: P) => { // when the (even-eased) line reaches the sample nearest this stop
  const f = spineTrace.at.reduce((best, a) => Math.hypot(a.p[0] - p[0], a.p[1] - p[1]) < Math.hypot(best.p[0] - p[0], best.p[1] - p[1]) ? a : best).f;
  return DRAW.start + DRAW.dur * (f < .5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2));
};

export default function HowItWorksPage() {
  return <>
    <div className="screen-top screen-short"><DuskScene variant="screen" reeds={false}/><AppHeader scene={false}/>
      <main id="main-content" className="how-hero">
        <div className="how-hero-copy">
          <h1 className="enter">One observation.<br/>A shared next step.</h1>
          <p className="lead enter enter-1">Turn local observations into a coordinated investigation. Different people. Clear steps. A clearer picture.</p>
          <div className="button-row enter enter-2"><Link className="button button-primary" href="/report/new">Report an observation</Link><Link className="button button-outline" href="/example">Explore an example</Link></div>
        </div>
        <MarginLine>People notice first. Evidence decides what is next.</MarginLine>
        <div className="stage-spine" aria-hidden="true" style={{ height: SPINE_H }}>
          <LightRoute publish lines={[{ pts: SPINE, kind: "main", ...DRAW }]} box={[1000, SPINE_H]} stretch sparkles={.9} seed={5}
            dots={STOPS.map((p, i) => ({ at: p, tone: i ? "end" : "origin", time: arrival(p) }))}/>
          {STOPS.map((p, i) => { const style = { left: `${p[0] / 10}%`, top: p[1], "--t": `${arrival(p)}s` } as CSSProperties;
            return <div key={i} className={i ? "spine-stop route-label" : "spine-stop route-label origin"} style={style}>
              <span className="spine-label route-label"><strong><span className="stop-index">0{i + 1}</span> {STAGES[i][0]}</strong><span>{STAGES[i][1]}</span></span></div>; })}
        </div>
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
    </section>
    <section className="landing-close how-close" aria-labelledby="principles-heading">
      <DuskScene variant="band"/>
      <div className="landing-close-inner section-shell">
        <Reveal className="close-heading"><h2 id="principles-heading">Evidence first.<br/>Uncertainty visible.</h2>
          <p className="close-lead">A photo can document a change. It cannot identify a pollutant or establish water safety.</p></Reveal>
        <Reveal className="close-limits">
          <div><h3>What a reading can say</h3><p>Conductivity alone does not identify a chemical or prove a source. Source-area analysis needs a reviewed network, comparable measurements and explicit uncertainty bounds. When those are missing, the investigation stays open and the next step is to build that foundation.</p></div>
          <div><h3>What a result means</h3><p>A reach that remains under consideration is not proven responsible. An excluded reach is incompatible under stated assumptions, not proven free of impact. New evidence can expand the area under consideration.</p>
            <Link href="/example" className="text-link">See how an investigation changes <Arrow/></Link></div>
        </Reveal>
        <Reveal className="close-invitation">
          <div className="stack"><h2 id="start-heading">Start with what you can safely observe.</h2>
            <p className="close-guidance">Stay on safe, permitted access routes. Do not enter the water or approach a suspected hazard to make a report. For an immediate threat, contact the appropriate local emergency service.</p></div>
          <div className="button-row"><Link className="button button-primary" href="/report/new">Make a report <Arrow/></Link></div>
        </Reveal>
      </div>
    </section>
    <Footer/>
  </>;
}

/** Hairline figures for the three roles, drawn in the same ink as the river lines; amber marks what each one handles. */
function RoleGlyph({ kind }: { kind: "notice" | "collect" | "review" }) {
  return <svg className="role-glyph" viewBox="0 0 120 80" fill="none" stroke="currentColor" strokeWidth=".95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "notice" ? <>
      <path className="soft" d="M22 64c0-8 1-14 4-22M26 64c1-6 3-11 7-16M18 64c-1-6-3-10-6-13M30 64c0-4 1-7 3-9M8 62c14-1.2 40-1 58-.4M76 60c8-1 22-1 34 .4M70 55.2c2.6-1 7.4-1 10 0M67 58.4c4-1.4 12-1.4 16 0"/>
      <circle cx="58" cy="17" r="5"/>
      <path d="M53 16.2c0-3.6 2.4-6 5.4-6 2.8 0 4.8 1.8 5.3 4.4 1.6.2 3 .7 3.8 1.4M54.5 22c-4.2 1.8-8 6.6-9.6 13.4-.8 3.4-1 6.4-.8 9M61.5 22.6c2.2 1.6 3.4 4.4 3.8 7.6M44.2 44.4c4.4 1.4 9.6 1.6 14 .4M62 23.5c3 3 5.3 7 6.6 11.8 1.4 4.6 3.4 9 5.8 13M59.6 26.6c2.4 3 4.4 6.4 5.6 10.6 1.4 4.8 3.4 9 6 12.6M71.2 49.8c.8 1.8 2.4 2.2 3.6 1.4.6-.6.4-1.6-.2-2.6M50 40c4-1.4 9.4-2 14.6-1.4 2.2.4 3.2 2 2.8 4M67.4 42.6c-.6 4.8-1.2 9.6-1.4 14.6M62.8 44.4c-.2 4.2-.4 8.2-.4 12.4M62.4 57c-.2 1.6 1 2.4 2.6 2.4h5.4c1 0 1.4-1 .6-1.8-1.2-1-3-1.6-4.8-1.8M45.2 44.8c-.6 4.4.4 9 2.8 12.6M49.6 45.6c.2 3.6 1 7 2.4 10M48 57.4c1.4 1.4 3.4 1.6 4.2 0M48.4 58.2c-3.4.4-7 .6-10.2.4-1.4 0-1.8-1.6-.6-2.2 1.4-.6 3-1 4.8-1.2"/>
      <circle className="accent" cx="75" cy="53.6" r="1"/></>
    : kind === "collect" ? <>
      <path className="soft" d="M20 58.4c10-1.4 20-1.4 30-.2M70 58.2c12-1.4 22-1.2 32 .2M48 60.6c4.6 1.2 19.4 1.2 24 0M44 64c7 1.6 25 1.6 32 0M74.6 64.6c2.6-1 7.6-1 10.2 0"/>
      <circle cx="60" cy="14" r="4.6"/>
      <path d="M52.6 11.6c4.8-1.4 10-1.4 14.8 0M56 11.2c.2-3 1.8-4.6 4-4.6s3.8 1.6 4 4.6M53 23c2-2.6 4.4-3.8 7-3.8s5 1.2 7 3.8M53 23c-.8 6-.8 12 .2 18M67 23c.8 6 .8 12-.2 18M56 27v6h8v-6M56 27l-1.6-5.6M64 27l1.6-5.6M53.2 41h13.6M53.2 41c.2 6 .6 11 1.4 17M59.6 43v15M60.4 43v15M66.8 41c-.2 6-.6 11-1.4 17M67 23.4c2.8 3 4.4 7.2 5 11.8M65.6 27.6c1.4 2.4 2.4 5 2.8 8M68.4 35.6c1.8 1.4 4 1.6 5.8.8.6-.8.4-1.8-.4-2.2M53 23.4c-2.8 3.4-4.2 7.8-4.6 12.6M54.4 27.8c-1.4 2.4-2.2 5.2-2.4 8M75.4 18l4.4 46"/>
      <path className="accent" d="M45.6 36.6h5.4v8h-5.4z"/></>
    : <>
      <path className="soft" d="M34 44.8h13M36 44.8v13.8M33 30c-.6 5-.4 10 .6 14.6M20 58.6h80"/>
      <circle cx="44" cy="16" r="5"/>
      <path d="M39.2 15.4c.4-4 2.4-6.4 5.4-6.4 3.4 0 5.6 2.4 5.6 5.6M39.6 14.4c-2 1.6-2.6 4-1.8 6.4M42 21.6c-3 2.2-4.8 6.6-5 12.4-.2 3.4.2 6.6.8 9M48 22.6c1.4 1.8 2 4 2.2 6.4M46 25c1 4.4 2.2 8 4 10.4 3.6.6 7.6.6 11.6.2M44.4 28.6c.8 3.8 2 7 3.6 9.2 3.6.8 8.4.8 13.6 0M37.8 43.2c5 .6 11 .6 16 0M53.8 43.2c.6 5 .8 10 .6 15M50 45.4c.4 4.4.6 8.6.4 12.8M50.4 58.4h6.8M58 38.6h34M88 38.6v19.8M60 37.6h22M68 37.6l4.8-14h16l-4.8 14"/>
      <path className="accent" d="M74.6 33l2.6-3 2.4 1.6 3.4-4.2"/></>}
  </svg>;
}
