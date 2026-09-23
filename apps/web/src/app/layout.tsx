import type { Metadata } from "next";
import { MotionPreferences } from "../components/motion-settings";
import { Providers } from "./providers";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/500.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/500.css";
import "@fontsource/newsreader/600.css";
import "./globals.css";
import "./dark.css";
import "./scene.css";

export const metadata: Metadata = { title: { default: "Upstream — Follow it upstream", template: "%s · Upstream" }, description: "Turn local stream observations into a coordinated, reviewable investigation. Notice a change, collect useful evidence, and decide the next step together." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><MotionPreferences/><a href="#main-content" className="skip-link">Skip to main content</a><Providers>{children}</Providers></body></html>;
}
