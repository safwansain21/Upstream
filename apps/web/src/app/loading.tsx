import { AppHeader } from "../components/app-header";
import { LoadingState } from "../components/ui";
export default function Loading() { return <><AppHeader/><main id="main-content" className="page-shell"><LoadingState label="Opening the page…"/></main></>; }
