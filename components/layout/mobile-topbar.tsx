"use client";

import { signOutOfDevice } from "@/components/pwa/push";
import { LogOut, Radar } from "lucide-react";
import { IconTooltip } from "@/components/ui/tooltip";
import { PRODUCT_NAME } from "@/lib/brand";
import { TeamSwitcher, type TeamView } from "@/components/teams/team-switcher";

// The desktop Sidebar (components/layout/sidebar.tsx) is the only other
// sign-out entry point, and it's hidden below md — without this, a mobile
// user had no way to sign out at all.
export function MobileTopbar({ userName, teamName, teamView }: { userName: string; teamName: string; teamView: TeamView }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border glass px-4 pb-3 pt-[calc(13px+env(safe-area-inset-top))] md:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Radar className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-semibold">{PRODUCT_NAME}</span>
        {teamView.canSwitch ? (
          <TeamSwitcher view={teamView} className="w-36" />
        ) : (
          <span className="truncate text-xs text-muted-foreground">· {teamView.squads.find((s) => s.id === teamView.current)?.name ?? teamName}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
          {userName.charAt(0)}
        </div>
        <IconTooltip label="Sign out">
          <button
            onClick={signOutOfDevice}
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
