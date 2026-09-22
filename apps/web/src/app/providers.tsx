"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ServiceWorker } from "../components/service-worker";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: (n, e: any) => n < 2 && !(e?.status >= 400 && e?.status < 500), staleTime: 15_000 } } }));
  return <QueryClientProvider client={client}><ServiceWorker/>{children}</QueryClientProvider>;
}
