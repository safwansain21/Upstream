import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "../../components/app-header";
import { Arrow } from "../../components/brand";
import { Footer, OriginBadge, PageIntro } from "../../components/ui";

export const metadata: Metadata = { title: "Explore an example" };
const examples = [
  ["useful-evidence", "Mill Brook · Useful evidence", "Follow a reviewed network and a traceable measurement through a source-area assessment."],
  ["precision-limited", "Mill Brook · Precision limited", "See why wider measurement and background bounds can leave several possibilities open."],
  ["revised-evidence", "Mill Brook · Revised evidence", "An instrument check changes how a reading can be used. Follow the review and the revised candidate area."],
  ["unmapped", "Unnamed stream · Mapping needed", "Start from a local observation, before a verified map or established stations exist."],
  ["confluence", "A confluence with several possibilities", "Understand why separate stream segments may be indistinguishable with the available observations."],
  ["tidal", "Tidal channel · A different flow regime", "Coordinate an investigation where the steady, directed-tree analysis is not applicable."],
  ["access-blocked", "When a field visit is not feasible", "An access update changes a proposed task. Explore how the next step is reviewed."],
  ["delivery-revision", "Keeping a recipient up to date", "Follow an evidence package and a separate acknowledgment when a revision supersedes it."],
];
export default function ExamplesPage() {
  return <><AppHeader/><main id="main-content" className="page-shell"><PageIntro title="Follow the evidence."><p>Eight ways an investigation can unfold. Start with Mill Brook, or explore a question that matters to your community.</p></PageIntro><div className="page-banner"><OriginBadge/><p>These read-only walkthroughs use synthetic records. The places, measurements, and scenarios are examples, not findings about a real stream.</p></div><div className="example-list">{examples.map(([slug, title, description], index) => <Link className="example-row" href={`/example/${slug}`} key={slug}><span className="row-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{description}</p></div><Arrow className="row-arrow"/></Link>)}</div></main><Footer/></>;
}
