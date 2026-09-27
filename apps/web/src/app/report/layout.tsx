import type { ReactNode } from "react";
// The notebook note's handwriting (Caveat 400, latin only, 48.8 KB woff2). Imported here so only the report routes load it.
import "@fontsource/caveat/latin-400.css";

export default function ReportLayout({ children }: { children: ReactNode }) { return children; }
