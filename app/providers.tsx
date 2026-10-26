"use client";

import { SessionProvider } from "next-auth/react";
import { ServiceWorkerRegister } from "@/components/pwa/install";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ServiceWorkerRegister />
      {children}
    </SessionProvider>
  );
}
