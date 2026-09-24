"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { AppHeader } from "../../../components/app-header";
import { Arrow } from "../../../components/brand";
import { DocumentTitle } from "../../../components/document-title";
import { InfoIcon } from "../../../components/icons";
import { NetworkDiagram, ReachLegend } from "../../../components/network-diagram";
import { Term } from "../../../components/term";
import { Timeline, type TimelineStep } from "../../../components/timeline";
import { CaseStatus, EmptyState, Footer, InlineError, LoadingState, MarginLine, OriginBadge } from "../../../components/ui";
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
  const e = q.data; const a = e?.assessment;
  let body;
  if (q.error) body = (q.error as ApiError).status === 404 ? <EmptyState title="This example is not available" steps={["The link may be out of date; the list of examples shows what is installed."]} action={<Link className="button button-outline" href="/example">All examples</Link>}/> : <InlineError>{q.error.message}</InlineError>;
  else if (!e) body = <LoadingState label="Loading the example…"/>;
  else {
    const kept = new Set(a?.eligible ? a.retained_geometry_ids : []);
    const view = e.network ? schematic(e.network.nodes, e.network.edges, new Set(e.network.stations.map(s => s.code)), x => !a?.eligible ? "unreviewed" : kept.has(x.id) ? "candidate" : "excluded") : null;
    const excluded = a?.eligible ? a.classes.filter(c => c.status === "incompatible").reduce((s, c) => s + Number(c.length_m), 0) : 0;
    const next = e.recommendations[0];
    const steps: TimelineStep[] = [
      { title: "Report received", detail: "A community member shared an observation.", state: "done" },
      { title: "Local map reviewed", detail: e.network ? "The reading was compared with the mapped network." : "No local network yet: the report stays a useful record.", state: e.network ? "done" : "pending" },
      { title: "Readings assessed", detail: a ? (a.eligible ? `Assessment ${a.revision} kept ${km(a.retained_length_m)} under consideration.` : "Computed, but not yet eligible to rule anything out.") : "No assessment computed yet.", state: a ? "done" : "pending" },
      { title: "Next useful observation", detail: next ? next.action_id.replace("visit-", "Measure at ") : "Nothing proposed yet.", state: next ? "current" : "pending" },
    ];
    body = <>
      <div className="example-grid">
        <section className="map-panel" aria-labelledby="map-h"><div className="panel-head"><div><h2 id="map-h">Local network</h2><p className="subtle small">{a ? `Assessment ${a.revision}` : "Not yet assessed"} · <OriginBadge origin={e.data_origin}/></p></div></div>
          {view ? <><NetworkDiagram label="Example network schematic" stations={view.stations} reaches={view.reaches}/><ReachLegend/></>
            : <p><strong>Map verification needed.</strong> No local network exists yet; the report is still a useful coordination record.</p>}</section>
        <aside className="example-notes stack-loose">
          <section aria-labelledby="changed-h" className="stack-tight"><h2 id="changed-h">What the evidence shows</h2>
            {!a ? <p className="muted">No assessment has been computed for this example yet.</p>
              : a.eligible ? <p className="muted"><span className="numeric">{km(a.retained_length_m)}</span> of stream is <Term k="retained">retained</Term>: a possible source there still fits every accepted reading. {excluded ? <><span className="numeric">{km(excluded)}</span> is <Term k="ruledOut">ruled out</Term> under the stated assumptions.</> : "Nothing is ruled out yet."}</p>
              : <><p className="muted">Nothing can be ruled out yet, because a <Term k="readiness">readiness</Term> check has not passed:</p><ul className="muted">{a.readiness_reasons.map(r => <li key={r}>{r}</li>)}</ul></>}
            {next ? <p className="muted">Next useful observation: <strong className="text-mist">{next.action_id.replace("visit-", "a reading at station ")}</strong>. {next.score_bound_m === null ? `Not scored: ${next.rationale}` : Number(next.score_bound_m) >= Number(a?.retained_length_m ?? 0) ? "No single reading can guarantee to narrow the area, but it can still help." : `Whatever it shows, at most ${km(next.score_bound_m)} would remain.`}</p> : null}</section>
          <section aria-labelledby="unknown-h" className="stack-tight"><h2 id="unknown-h">What remains unknown</h2>
            <p className="muted">The source of the change is unconfirmed. Neither the retained nor the ruled-out stretches prove a source or indicate water safety. More observations and context are needed.</p></section>
          <p className="callout"><InfoIcon/><span><strong>Source unconfirmed</strong>This is a synthetic example. It shows how evidence can change the map, not a real investigation or a confirmed event.</span></p>
        </aside>
      </div>
      {e.readings.length ? <section className="stack" aria-labelledby="ev-h"><h2 id="ev-h">Synthetic evidence</h2>
        <div className="table-scroll" role="region" aria-label="Example readings" tabIndex={0}><table className="data-table"><thead><tr><th scope="col">Station</th><th scope="col">Value</th><th scope="col">Quality</th></tr></thead>
          <tbody>{e.readings.map((r, i) => <tr key={i}><td>{r.station}</td><td className="numeric">{r.lower ? <>true <Term k="sc25">SC25</Term> in [{r.lower}, {r.upper}] µS/cm</> : `${r.value} ${r.unit}`}</td><td>{r.quality ?? "pending review"}</td></tr>)}</tbody></table></div></section> : null}
      <div className="example-foot"><Timeline steps={steps} label="How this example unfolded"/>
        <div className="example-actions"><Link className="button button-primary" href="/example">More examples <Arrow/></Link><p className="subtle small">See how other examples unfold.</p>
          <Link className="button button-outline" href="/report/new">Start your own observation</Link><p className="subtle small">See something in your local water?</p></div></div>
    </>;
  }
  return <><AppHeader/><main id="main-content" className="page-shell example-detail"><DocumentTitle title={e?.title ?? "Example investigation"}/>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link className="back" href="/example">Examples</Link></nav>
    <div className="page-intro"><div><span className="eyebrow amber ruled">Synthetic example</span><h1>{e?.title ?? "Example investigation"}</h1>
      {e ? <div className="intro-copy"><p>{e.summary}</p><p className="meta-row"><CaseStatus tone="active">{WORKFLOW[e.workflow] ?? e.workflow}</CaseStatus><span>Cause unconfirmed</span>{e.locality ? <span>{e.locality}</span> : null}</p></div> : null}</div>
      <div className="intro-aside"><MarginLine>Same waters. A clearer picture.</MarginLine></div></div>
    {body}</main><Footer/></>;
}
