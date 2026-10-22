"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TIMEZONE } from "@/lib/time";

const TeamTimezoneContext = createContext<string>(DEFAULT_TIMEZONE);

/** Set once in app/(app)/layout.tsx from the signed-in user's Team.timezone. */
export function TeamTimezoneProvider({ timezone, children }: { timezone: string; children: React.ReactNode }) {
  return <TeamTimezoneContext.Provider value={timezone}>{children}</TeamTimezoneContext.Provider>;
}

export function useTeamTimezone() {
  return useContext(TeamTimezoneContext);
}
