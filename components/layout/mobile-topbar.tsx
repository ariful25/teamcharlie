"use client";

import { signOut } from "next-auth/react";
import { LogOut, Radar } from "lucide-react";
import { IconTooltip } from "@/components/ui/tooltip";

// The desktop Sidebar (components/layout/sidebar.tsx) is the only other
// sign-out entry point, and it's hidden below md — without this, a mobile
// user had no way to sign out at all.
export function MobileTopbar({ userName }: { userName: string }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border glass px-4 py-3 md:hidden">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">CHARLIE HQ</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
          {userName.charAt(0)}
        </div>
        <IconTooltip label="Sign out">
          <button
            onClick={() => signOut({ callbackUrl: "/login?signedOut=1" })}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </IconTooltip>
      </div>
    </div>
  );
}
