import type { Metadata } from "next";
import { getPortalUser } from "@/lib/portal/session";
import { PortalNav } from "@/components/portal/portal-nav";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = { title: "Owner portal" };

// The owner's side of TeamHQ: its own frame, its own sign-in check
// (lib/portal/session.ts), no staff navigation at all.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const owner = await getPortalUser();
  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen">
        <PortalNav clientName={owner.clientName} ownerName={owner.name} />
        <main className="mx-auto max-w-[1200px] px-4 pb-[calc(34px+env(safe-area-inset-bottom))] pt-8 md:px-8">{children}</main>
      </div>
    </TooltipProvider>
  );
}
