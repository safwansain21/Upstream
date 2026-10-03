"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The landing story's companion figure: one illustrative stream network that follows the three steps beside it.
 * 1 the stream: the stretches the readings rule out fade to dashes, the rest stay worth checking.
 * 2 people and animals: the recorded contact layers appear on the same water.
 * 3 the people who act: the evidence leaves as a signed package.
 * Drawn in the network's own code (retained solid, ruled out dashed, stations as rings, the report in amber).
 * Decorative: every fact here is in the text beside it. Illustrative, synthetic, never a real network.
 */
const RETAINED = [
  "M240 470 C236 430 250 398 244 360",
  "M244 360 C222 336 192 324 170 296",
  "M244 360 C272 336 300 318 318 288",
  "M318 288 C350 262 382 232 400 196 C410 170 420 142 432 112",
];
const RULED = [
  "M170 296 C150 262 122 240 112 202 C104 172 94 140 86 114",
  "M170 296 C184 258 196 222 196 184 C198 154 206 124 214 98",
  "M318 288 C300 252 288 214 284 176 C280 146 270 116 262 92",
];
const STATIONS: [number, number, string][] = [[240, 470, "O"], [204, 326, "A3"], [290, 318, "B2"]];

export function StoryVisual() {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(1);
  useEffect(() => {
    const steps = [...document.querySelectorAll<HTMLElement>(".story-step")];
    if (!steps.length) return;
    const observer = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) setStep(steps.indexOf(e.target as HTMLElement) + 1);
    }), { rootMargin: "-42% 0px -42% 0px" });
    steps.forEach(s => observer.observe(s));
    const shown = new IntersectionObserver(([e]) => { if (e.isIntersecting) { ref.current?.classList.add("is-drawn"); shown.disconnect(); } }, { threshold: .25 });
    if (ref.current) shown.observe(ref.current);
    return () => { observer.disconnect(); shown.disconnect(); };
  }, []);
  return <aside ref={ref} className="story-visual" data-step={step} aria-hidden="true">
    <div className="story-visual-inner">
      <svg viewBox="60 76 420 424" className="story-network">
        <g className="sv-ruled">{RULED.map((d, i) => <path key={i} d={d} pathLength={1} style={{ "--i": i + 4 } as React.CSSProperties}/>)}</g>
        <g className="sv-retained">{RETAINED.map((d, i) => <path key={i} d={d} pathLength={1} style={{ "--i": i } as React.CSSProperties}/>)}</g>
        <g className="sv-context">
          <path className="sv-people" d="M262 372 C288 350 312 334 330 306 C344 284 362 268 384 258"/><circle className="sv-people-spot" cx="331" cy="304" r="4.5"/><text x="342" y="322">footpath, paddling spot</text>
          <circle className="sv-animals" cx="252" cy="418" r="9"/><text x="268" y="422">cattle drinking point</text>
          <path className="sv-habitat" d="M226 470 C224 452 230 440 229 426"/><text x="216" y="452" textAnchor="end">kingfisher bank</text>
        </g>
        <g className="sv-stations">{STATIONS.map(([x, y, code]) => <g key={code}><circle cx={x} cy={y} r="6"/><text x={x + 12} y={y + 4}>{code}</text></g>)}</g>
        <g className="sv-report"><circle cx="304" cy="302" r="5"/><circle className="sv-report-ring" cx="304" cy="302" r="12"/></g>
      </svg>
      <div className="sv-package">
        <p className="sv-package-title">Evidence package</p>
        <p className="sv-package-meta">Mill Brook · one revision · synthetic</p>
        <ul><li>Every reading quality-reviewed</li><li>Signed manifest</li><li>PDF · JSON · GeoJSON · FHIR R4</li><li>The recipient acknowledges this revision</li></ul>
      </div>
      <ul className="sv-legend">
        <li><span className="sv-key retained"/>Worth checking</li><li><span className="sv-key ruled"/>Ruled out</li><li><span className="sv-key report"/>The report</li>
      </ul>
      <p className="sv-note">Illustrative network · synthetic</p>
    </div>
  </aside>;
}
