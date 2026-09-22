"use client";
import { useState } from "react";
import { TaskList } from "../../../../components/tasks";
import { PageIntro } from "../../../../components/ui";
import { useOrg } from "../../../../lib/session";

export default function Tasks() {
  const { org, can } = useOrg();
  type View = "mine" | "available" | "all";
  const tabs: [View, string][] = [["mine", "My tasks"], ["available", "Available to me"], ...(can("coordinate") ? [["all", "Coordinating"] as [View, string]] : [])];
  const [tab, setTab] = useState<View>("mine");
  return <main id="main-content" className="page-shell"><PageIntro title="Field tasks"><p>Only feasible, qualified work appears here. Use approved access points; declining unsafe or inaccessible work is always valid.</p></PageIntro>
    <div className="tab-nav" role="tablist" aria-label="Task views">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : undefined} onClick={() => setTab(id)}>{label}</button>)}</div>
    <div role="tabpanel"><TaskList org={org} filter={tab}/></div></main>;
}
