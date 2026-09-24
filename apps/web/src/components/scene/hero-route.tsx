/**
 * The landing's illustrative journey (handoff home-light-route.svg), in plate coordinates inside the scene art box.
 * Not hydrology and never a case map. Timing is chained in CSS: each branch starts when the main line reaches its
 * junction and each end dot arrives when its own path completes (see .hero-route in scene.css).
 */
const MAIN = "M455 708 C540 685 642 660 752 622 C856 585 939 573 993 522 C1031 484 1037 454 1108 437 C1177 422 1255 420 1325 398 C1397 376 1452 371 1513 369";
const BRANCHES = [
  { d: "M1044 453 C1092 421 1142 405 1195 389 C1231 378 1271 369 1321 345", at: .62, end: [1321, 345] },
  { d: "M1195 389 C1171 367 1147 350 1141 329 C1140 307 1114 300 1085 291", at: .74, end: [1085, 291] },
  { d: "M1325 398 C1315 371 1353 355 1415 338 C1456 326 1480 313 1497 294", at: .84, end: [1497, 294] },
];

export function HeroRoute({ note }: { note: string }) {
  return <>
    <svg className="hero-route" viewBox="0 0 1672 941" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="hero-route-ink" x1="455" y1="708" x2="1513" y2="369" gradientUnits="userSpaceOnUse">
        <stop stopColor="#EEAF63"/><stop offset=".28" stopColor="#F4F0E8"/><stop offset="1" stopColor="#D8F0EF"/></linearGradient></defs>
      <g className="route-glow"><path d={MAIN} className="route-main"/>{BRANCHES.map((b, i) => <path key={i} d={b.d} className="route-branch" style={{ "--at": b.at } as React.CSSProperties}/>)}</g>
      <g className="route-ink"><path d={MAIN} className="route-main" data-route-path="main"/>{BRANCHES.map((b, i) => <path key={i} d={b.d} className="route-branch" style={{ "--at": b.at } as React.CSSProperties}/>)}</g>
      <circle className="route-origin" data-origin-dot cx="455" cy="708" r="7"/>
      <circle className="route-end" cx="1513" cy="369" r="4" style={{ "--at": 1 } as React.CSSProperties}/>
      {BRANCHES.map((b, i) => <circle key={i} className="route-end route-branch-end" cx={b.end[0]} cy={b.end[1]} r="4" style={{ "--at": b.at } as React.CSSProperties}/>)}
    </svg>
    <p className="hero-origin-note" style={{ left: `${455 / 16.72}%`, top: `${708 / 9.41}%` }}>{note}</p>
  </>;
}
