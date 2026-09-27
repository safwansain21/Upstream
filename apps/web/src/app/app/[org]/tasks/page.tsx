"use client";
import Link from "next/link";
import { useState } from "react";
import { TaskList } from "../../../../components/tasks";
import { Term } from "../../../../components/term";
import { PageIntro } from "../../../../components/ui";
import { useOrg } from "../../../../lib/session";

export default function Tasks() {
  const { org, can } = useOrg();
  type View = "mine" | "available" | "all";
  const tabs: [View, string][] = [["mine", "My tasks"], ["available", "Available to me"], ...(can("coordinate") ? [["all", "Coordinating"] as [View, string]] : [])];
  const [tab, setTab] = useState<View>("mine");
  return <main id="main-content" className="page-shell field-tasks-page"><PageIntro title="Field tasks"><p>Only feasible, qualified work appears here. Use approved access points; declining unsafe or inaccessible work is always valid.</p></PageIntro>
    <div className="field-tasks-layout">
      <div className="field-tasks-main">
        <div className="tab-nav" role="tablist" aria-label="Task views">{tabs.map(([id, label]) => <button key={id} id={`task-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="task-panel" className={tab === id ? "active" : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
        <div role="tabpanel" id="task-panel" aria-labelledby={`task-tab-${tab}`} key={tab} className="task-panel"><TaskList org={org} filter={tab}/></div>
      </div>
      <aside className="field-tasks-aside" aria-label="About field tasks">
        <section><h2>Who can take a task</h2><ul className="plain-checks">
          <li>A member of this workspace</li><li>With a valid <Term k="qualification">qualification</Term> for that kind of task</li>
          <li>Using an instrument whose calibration is current, when the task needs one</li><li>Following the listed protocol and approved access</li></ul></section>
        <section><h2>Safety first</h2><p>Stay on approved paths and banks. If a place is unsafe, closed or not reachable, decline the task and say why: that is useful information too.</p></section>
        <section><h2>Everyone contributes</h2><p>No one is ranked by how many samples they take. Care and consistency matter more than quantity.</p><Link className="text-link" href="/how-it-works">How investigations work <span aria-hidden="true">→</span></Link></section>
      </aside>
    </div></main>;
}
