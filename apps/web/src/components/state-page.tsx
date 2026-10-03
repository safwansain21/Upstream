import type { ReactNode } from "react";
import { AppHeader } from "./app-header";
import { DuskScene } from "./scene/dusk-scene";
import { SceneRoute, type Stop } from "./scene/scene-route";

const ROUTE: Stop[] = [{ x: 878, y: 704, tone: "origin" }, { x: 980, y: 694, ghost: true }, { x: 1110, y: 676, ghost: true }, { x: 1240, y: 636, ghost: true }, { x: 1300, y: 596 }];

/** Loading, error and not-found share one quiet composition: the scene, one line, a plain message and a way on. */
export function StatePage({ label, title, children, busy = false }: { label: string; title: string; children?: ReactNode; busy?: boolean }) {
  return <div className="screen-top"><DuskScene variant="screen" eager={busy} still={busy} route={busy ? null : <SceneRoute stops={ROUTE} duration={1.6}/>}/><AppHeader scene={false}/>
    <main id="main-content" className="state-page" aria-busy={busy || undefined}><p className="eyebrow">{label}</p><h1>{title}</h1>{children}</main></div>;
}
