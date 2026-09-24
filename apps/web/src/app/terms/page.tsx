import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "../../components/app-header";
import { AlertIcon, ShieldIcon } from "../../components/icons";
import { PolicyDoc } from "../../components/policy-doc";
import { Footer } from "../../components/ui";

export const metadata: Metadata = { title: "Terms of use" };
export default function TermsPage() {
  return <><AppHeader/><PolicyDoc numbered eyebrow="Terms of use" title="Taking part responsibly."
    intro={<p>Upstream supports environmental observations, coordinated field work, and reviewable evidence. Each investigation depends on the quality of its records and the limits of its methods.</p>}
    aside={<><p className="policy-callout"><ShieldIcon size={30}/>A report never requires entering a stream, crossing private land, or approaching a hazard.</p>
      <p className="policy-callout"><AlertIcon size={30}/>Reports and analysis do not establish water safety or identify a pollutant from a photograph.</p></>}
    sections={[
      { id: "observed", title: "Describe what you observed", body: <p>Contribute information you are entitled to share. Distinguish what you directly observed from an interpretation or secondhand account. Do not include unnecessary personal information, accusations, or material you do not have permission to use.</p> },
      { id: "safe", title: "Keep field work safe", body: <p>A report never requires entering a stream, crossing private land, approaching a hazard, or collecting a sample. Only accept work you are qualified and equipped to perform. Declining an unsafe or inaccessible task is a valid outcome.</p> },
      { id: "limits", title: "Understand the limits", body: <p>Reports and analysis do not establish water safety, identify a pollutant from a photograph, or confirm responsibility for a suspected source. An assessment is conditional on its stated evidence, assumptions, and uncertainty. See <Link href="/how-it-works">how interpretation works</Link>.</p> },
      { id: "review", title: "Review before acting", body: <p>Consequential investigation decisions need authorized human review. Check a package’s version and supersession status before relying on it. Do not present a synthetic example as a real field finding.</p> },
      { id: "local", title: "Local operation", body: <p>The organization operating an investigation is responsible for its procedures, lawful access, participant qualifications, and sharing decisions. Its local participation terms and contact details should be supplied before live work begins.</p> },
    ]}/><Footer/></>;
}
