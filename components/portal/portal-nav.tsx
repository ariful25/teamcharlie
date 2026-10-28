"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Radar } from "lucide-react";
import { IconTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/portal", label: "Overview", exact: true },
  { href: "/portal/reviews", label: "Reviews" },
  { href: "/portal/requests", label: "Requests" },
];

export function PortalNav({ clientName, ownerName }: { clientName: string; ownerName: string }) {
  const pathname = usePathname() ?? "";
  return (
    <header className="sticky top-0 z-20 border-b border-border glass pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 md:flex-nowrap md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 glow-border">
            <Radar className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{clientName}</p>
            <p className="truncate text-[11px] text-muted-foreground">Owner portal</p>
          </div>
        </div>
        {/* Phones: its own full-width row under the name. */}
        <nav aria-label="Portal" className="order-last flex w-full items-center gap-1 text-sm md:order-none md:ml-auto md:w-auto">
          {LINKS.map((l) => {
            const active = l.exact ? pathname === l.href || pathname.startsWith("/portal/listings") : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn("whitespace-nowrap rounded-lg px-3 py-1.5", active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <IconTooltip label={`Sign out ${ownerName}`}>
          <button
            onClick={() => signOut({ callbackUrl: "/portal/login" })}
            aria-label="Sign out"
            className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </IconTooltip>
      </div>
    </header>
  );
}
