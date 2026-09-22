import type { NextConfig } from "next";

// ponytail: one root .env for API, worker and web; only public (anon) values are exposed to the browser.
try { process.loadEnvFile("../../.env"); } catch { /* production injects environment directly */ }

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL || "", NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
    NEXT_PUBLIC_INTAKE_ORG_ID: process.env.INTAKE_ORG_ID || "",
    NEXT_PUBLIC_MAP_STYLE_URL: process.env.MAP_STYLE_URL || "" },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:8000";
    return [{ source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` }];
  },
};
export default nextConfig;
