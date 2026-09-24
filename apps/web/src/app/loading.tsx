import { LoadingState } from "../components/ui";
import { StatePage } from "../components/state-page";
export default function Loading() { return <StatePage busy label="Loading" title="Opening the page…"><LoadingState label="Gathering the latest records."/></StatePage>; }
