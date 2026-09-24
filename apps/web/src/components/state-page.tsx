import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { DuskScene } from "./scene/dusk-scene";
import { SceneRoute, type Stop } from "./scene/scene-route";

const ROUTE: Stop[] = [{ x: 750, y: 880, tone: "origin" }, { x: 1000, y: 842, ghost: true }, { x: 1170, y: 790, ghost: true }, { x: 1286, y: 700, ghost: true }, { x: 1300, y: 640 }];

/** Loading, error and not-found share one quiet composition: the scene, one line, a plain message and a way on. */
export function StatePage({ label, title, children, busy = false }: { label: string; title: string; children?: ReactNode; busy?: boolean }) {
  return <div className="screen-top"><DuskScene variant="screen" route={busy ? null : <SceneRoute stops={ROUTE} duration={1.6}/>}/><AppHeader scene={false}/>
    <main id="main-content" className="state-page" aria-busy={busy || undefined}><p className="eyebrow">{label}</p><h1>{title}</h1>{children}</main></div>;
}
