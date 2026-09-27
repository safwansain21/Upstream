import { LoadingState } from "../../../components/ui";

/** Workspace navigation loads inside the shell: the header band stays, so no second scene mounts for a brief wait. */
export default function Loading() {
  return <main id="main-content" className="page-shell" aria-busy="true"><div className="page-intro"><div><span className="eyebrow">Loading</span><h1>Opening the page…</h1></div></div>
    <LoadingState label="Gathering the latest records."/></main>;
}
