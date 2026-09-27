"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { OfflineStatus } from "../../../../components/offline";
import { AppHeader } from "../../../../components/app-header";
import { ReportForm } from "../../../../components/report-form";
import { MarginLine, PageIntro } from "../../../../components/ui";

export default function EditReport() {
  const { draft } = useParams<{ draft: string }>();
  return <><OfflineStatus/><AppHeader/><main id="main-content" className="report-page">
    <p className="report-margin" aria-hidden="true">People see it first.<br/>That’s where it starts.</p>
    <div className="report-column">
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link className="back" href="/">Report an observation</Link></nav>
      <ReportForm draftId={draft} intro={step => step === 3
        ? <PageIntro title="Review your observation" aside={<MarginLine>Local observations lead to real questions.</MarginLine>}><p>Check what will be shared before you send it.</p></PageIntro>
        : <PageIntro title="What caught your attention?" aside={<MarginLine>Local observations lead to real questions.</MarginLine>}><p>Share what you noticed. The team will help investigate. You do not need to know the stream’s name or find it on a map.</p></PageIntro>}/>
    </div></main></>;
}
