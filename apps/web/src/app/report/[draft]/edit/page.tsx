"use client";
import { useParams } from "next/navigation";
import { AppHeader } from "../../../../components/app-header";
import { ReportForm } from "../../../../components/report-form";
import { PageIntro } from "../../../../components/ui";

export default function EditReport() {
  const { draft } = useParams<{ draft: string }>();
  return <><AppHeader/><main id="main-content" className="page-shell"><PageIntro title="What caught your attention?"><p>Share what you noticed. The team will help investigate. You do not need to know the stream’s name or find it on a map.</p></PageIntro><ReportForm draftId={draft}/></main></>;
}
