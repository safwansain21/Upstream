import type { Mark } from "./branch-marks";
import { LightRoute, type Line } from "./light-route";
import { OriginNote } from "./origin-note";
import type { P } from "./route-geometry";

/**
 * The landing's illustrative journey (reference 07-visible-current), in plate coordinates inside the scene art box.
 * Not hydrology and never a case map. The amber origin (on open water, never in the reeds) wakes at 550 ms, the main line draws to the junction by 1.8 s,
 * the three branches grow out of that one point along its tangent, and each end dot arrives when its branch completes.
 */
const ORIGIN: P = [776, 602], J: P = [1113, 507];
const MAIN: P[] = [ORIGIN, [846, 590], [912, 572], [960, 552], [1003, 532], [1053, 515], J];
const LEAD = MAIN[MAIN.length - 2];
const A: P[] = [J, [1166, 472], [1136, 424], [1098, 388], [1018, 363]], B: P[] = [J, [1220, 462], [1252, 420], [1380, 384]], C: P[] = [J, [1270, 491], [1372, 479], [1467, 442]];
/** The same journey for the Mill Brook example card, where two of the branches are ruled out. */
export const HERO = { ORIGIN, J, MAIN, LEAD, A, B, C };
/** Where water joins upstream along each branch, and how readings settle it. Parallel places, never a sequence;
 *  illustrative, like the whole scene. */
export const BRANCH_MARKS: Mark[] = [
  { at: A[A.length - 1], term: "Field drain", line: "Runoff from farmland joins after heavy rain. A reading either side shows whether it changes the water.", sides: ["right", "above", "left", "below"] },
  { at: B[B.length - 1], term: "Road culvert", line: "Water off the road enters at this bend. If readings match above and below, this branch is ruled out." },
  { at: C[C.length - 1], term: "Pipe outfall", line: "A discharge point. A reading that changes across it keeps this branch worth checking.", sides: ["below", "left", "above"] },
];
const LINES: Line[] = [
  { pts: MAIN, kind: "main", start: .65, dur: 1, ease: "in" },
  { pts: [[880, 584], [940, 563], [985, 545], [1040, 524], J, [1190, 500]], kind: "strand", start: 1.05, dur: .9 },
  { pts: [[900, 591], [960, 567], [1010, 541], [1060, 525], [1120, 514], [1230, 498]], kind: "strand", start: 1.15, dur: .85 },
  { pts: A, lead: LEAD, start: 1.8, dur: .8, ease: "out" },
  { pts: B, lead: LEAD, start: 1.86, dur: .72, ease: "out" },
  { pts: C, lead: LEAD, start: 1.92, dur: .78, ease: "out" },
];

export function HeroRoute({ note }: { note: string }) {
  return <>
    <LightRoute publish className="hero-route" lines={LINES} sparkles={1.2} ink={{ id: "hero-route-ink", from: ORIGIN, to: J }}
      dots={[{ at: ORIGIN, tone: "origin", time: .5 }, { at: A[A.length - 1], tone: "end", time: 2.6 }, { at: B[B.length - 1], tone: "end", time: 2.58 }, { at: C[C.length - 1], tone: "end", time: 2.7 }]}/>
    <OriginNote note={note} left={`${ORIGIN[0] / 16.72}%`} top={`${ORIGIN[1] / 9.41}%`}/>
  </>;
}
