import type { Metadata, Viewport } from "next";
import { MotionPreferences } from "../components/motion-settings";
import { Providers } from "./providers";
// Fonts (self-hosted, latin subset loads on use): display serif 500 + italic 400 for margin lines; body sans 400/500/600; mono 400.
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/500.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./design.css";
import "./scene.css";
import "./pages.css";

export const metadata: Metadata = { title: { default: "Upstream — Follow it upstream", template: "%s · Upstream" }, description: "Turn local stream observations into a coordinated, reviewable investigation. Notice a change, collect useful evidence, and decide the next step together." };
export const viewport: Viewport = { themeColor: "#071113", colorScheme: "dark" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><MotionPreferences/><a href="#main-content" className="skip-link">Skip to main content</a><Providers>{children}</Providers></body></html>;
}
