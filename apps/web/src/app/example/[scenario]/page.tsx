"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { AppHeader } from "../../../components/app-header";
import { NetworkDiagram, ReachLegend } from "../../../components/network-diagram";
import { CaseStatus, EmptyState, Footer, InlineError, LoadingState, OriginBadge, PageIntro } from "../../../components/ui";
import { api, ApiError } from "../../../lib/api";
import { schematic } from "../../../lib/geo";
import { WORKFLOW } from "../../../lib/labels";

type Example = { title: string; summary: string; workflow: string; locality: string | null; data_origin: string;
  network: { nodes: { code: string; kind: string; lon: number; lat: number }[]; edges: { id: string; code: string; from_code: string; to_code: string; length_m: string; flow_status: string }[]; stations: { code: string }[] } | null;
  readings: { station: string; mode: string; lower: string | null; upper: string | null; value: string; unit: string; measured_at: string; quality: string | null }[];
  recommendations: { action_id: string; score_bound_m: string | null; rationale: string }[];
  assessment: { revision: number; retained_length_m: string; eligible: boolean; readiness_reasons: string[]; retained_geometry_ids: string[]; classes: { id: string; reach_ids: string[]; length_m: string; status: string }[] } | null };
const km = (m: string | number) => `${(Number(m) / 1000).toFixed(2)} km`;

export default function ExampleScenario() {
  const { scenario } = useParams<{ scenario: string }>();
  const q = useQuery({ queryKey: ["example", scenario], retry: false, queryFn: () => api<Example>(`/examples/${scenario}`) });
  let body;
  if (q.error) body = (q.error as ApiError).status === 404 ? <EmptyState title="This example is not available" action={<Link className="button button-outline" href="/example">All examples</Link>}/> : <InlineError>{q.error.message}</InlineError>;
  else if (!q.data) body = <LoadingState label="Loading the example…"/>;
  else {
    const e = q.data; const a = e.assessment; const kept = new Set(a?.eligible ? a.retained_geometry_ids : []);
    const view = e.network ? schematic(e.network.nodes, e.network.edges, new Set(e.network.stations.map(s => s.code)), x => !a?.eligible ? "unreviewed" : kept.has(x.id) ? "candidate" : "excluded") : null;
    body = <>
      <div className="page-banner" role="note"><OriginBadge origin={e.data_origin}/><p>Synthetic example. Read-only: nothing here changes real records.</p></div>
      <p>{e.summary}</p>
      <p><CaseStatus>{WORKFLOW[e.workflow] ?? e.workflow}</CaseStatus> <span>Cause unconfirmed</span> · {e.locality}</p>
      <div className="case-grid">
        <section className="surface stack" aria-labelledby="map-h"><h2 id="map-h">Local network</h2>
          {view ? <><NetworkDiagram label="Example network schematic" stations={view.stations} reaches={view.reaches}/><ReachLegend/></> : <p><strong>Map verification needed.</strong> No local network exists yet; the report is still a useful coordination record.</p>}</section>
        <section className="surface stack" aria-labelledby="area-h"><h2 id="area-h">Investigation area</h2>
          {!a ? <p><strong>Investigation area not yet established.</strong> No assessment has been computed for this example.</p>
            : a.eligible ? <><p className="numeric"><strong>{km(a.retained_length_m)}</strong> under consideration (assessment {a.revision})</p>
              <ul>{a.classes.map(c => <li key={c.id}>{c.reach_ids.join(", ")} · {km(c.length_m)} · {c.status === "incompatible" ? "excluded under current bounds" : c.status}</li>)}</ul></>
            : <><p><strong>Localization not eligible.</strong></p><ul>{a.readiness_reasons.map(r => <li key={r}>{r}</li>)}</ul></>}
          {e.recommendations.length ? <><h3>Next useful observation</h3><ul>{e.recommendations.map(r => <li key={r.action_id}>{r.action_id.replace("visit-", "Measure at ")} · {r.score_bound_m === null ? `not scored: ${r.rationale}` : Number(r.score_bound_m) >= Number(a?.retained_length_m ?? 0) ? `no guaranteed narrowing (conservative bound ${km(r.score_bound_m)})` : `at most ${km(r.score_bound_m)} would remain`}</li>)}</ul></> : null}
        </section>
      </div>
      <section className="surface stack" aria-labelledby="ev-h"><h2 id="ev-h">Synthetic evidence</h2>
        {e.readings.length ? <div className="table-scroll" role="region" aria-label="Example readings" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Station</th><th scope="col">Value</th><th scope="col">Quality</th></tr></thead>
          <tbody>{e.readings.map((r, i) => <tr key={i}><td>{r.station}</td><td className="numeric">{r.lower ? `true SC25 in [${r.lower}, ${r.upper}] µS/cm` : `${r.value} ${r.unit}`}</td><td>{r.quality ?? "pending review"}</td></tr>)}</tbody></table></div>
          : <p>No measurements yet.</p>}</section>
    </>;
  }
  return <><AppHeader/><main id="main-content" className="page-shell"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/example">Examples</Link> / <span aria-current="page">{q.data?.title ?? "Example"}</span></nav>
    <PageIntro title={q.data?.title ?? "Example investigation"}/>{body}</main><Footer/></>;
}
