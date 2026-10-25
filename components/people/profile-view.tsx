"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProfileData } from "@/lib/people/queries";

import { IdentityPanel } from "./profile/identity";
import { OverviewTab } from "./profile/overview";
import { JobTab } from "./profile/job";
import { PersonalTab } from "./profile/personal";
import { TimeTab } from "./profile/time";
import { DocumentsTab } from "./profile/documents";
import { HistoryTab } from "./profile/history";

type Tab = "overview" | "job" | "personal" | "time" | "documents" | "history";

export function ProfileView({ data }: { data: ProfileData }) {
  const { access, person, job, about } = data;
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "overview", label: "Overview", show: true },
    { id: "job", label: "Job", show: true },
    { id: "personal", label: "Personal", show: !!data.personal || access.viewEmergency },
    { id: "time", label: "Time & leave", show: !!data.month },
    { id: "documents", label: "Documents", show: access.viewDocuments },
    { id: "history", label: "History", show: true },
  ];
  const [tab, setTab] = useState<Tab>("overview");
  const first = about.preferredName ?? person.name.split(" ")[0];

  return (
    <div className="grid gap-8 lg:grid-cols-golden-r lg:items-start">
      <IdentityPanel data={data} />

      <div className="min-w-0 space-y-5">
        <div role="tablist" aria-label={`${first}'s profile`} className="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5 shadow-card">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-xl px-5 py-2 text-sm transition-colors",
                  tab === t.id ? "bg-primary/15 font-medium text-primary shadow-glow-sm" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
        </div>

        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "job" && <JobTab data={data} />}
        {tab === "personal" && <PersonalTab data={data} />}
        {tab === "time" && <TimeTab data={data} />}
        {tab === "documents" && <DocumentsTab data={data} />}
        {tab === "history" && <HistoryTab data={data} />}
      </div>
    </div>
  );
}
