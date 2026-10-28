"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutOfDevice } from "@/components/pwa/push";
import {
  LayoutDashboard,
  CalendarClock,
  ListChecks,
  Clock,
  StickyNote,
  Settings,
  Radar,
  LogOut,
  Circle,
  FileSpreadsheet,
  HeartPulse,
  ShieldCheck,
  Wallet,
  Users,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTooltip } from "@/components/ui/tooltip";
import { permissions, type AppRole } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";
import { TeamSwitcher, type TeamView } from "@/components/teams/team-switcher";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shift-schedule", label: "Shift Schedule", icon: CalendarClock },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/people", label: "People", icon: Users },
  { href: "/notices", label: "Notices", icon: StickyNote },
  { href: "/knowledge-base", label: "Knowledge Base", icon: FileSpreadsheet },
  { href: "/listing-health", label: "Listing Health", icon: HeartPulse },
  { href: "/reviews", label: "Reviews", icon: Star },
];

export function Sidebar({
  user,
  teamName,
  teamView,
  checkedIn,
  clients,
}: {
  user: { name: string; role: string; avatarUrl?: string | null };
  teamName: string;
  teamView: TeamView;
  checkedIn: boolean;
  clients: { id: string; name: string }[];
}) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border glass md:flex">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 glow-border">
          <Radar className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{PRODUCT_NAME}</p>
          <p className="truncate text-[11px] text-muted-foreground">{teamName}</p>
        </div>
      </div>
      <TeamSwitcher view={teamView} className="px-5 pb-5" />

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-primary/15 text-primary glow-border"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {permissions.canEditAttendance(user.role as AppRole) && (
          <Link
            href="/attendance/admin"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              pathname?.startsWith("/attendance/admin")
                ? "bg-primary/15 text-primary glow-border"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Team Attendance
          </Link>
        )}

        {permissions.canManagePayroll(user.role as AppRole) && (
          <Link
            href="/payroll"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              pathname?.startsWith("/payroll")
                ? "bg-primary/15 text-primary glow-border"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Wallet className="h-4 w-4" />
            Payroll
          </Link>
        )}

        <div className="pt-4">
          <Link
            href="/clients"
            className={cn(
              "block px-3 pb-1.5 text-[11px] font-medium transition-colors",
              pathname === "/clients"
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Clients
          </Link>
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                pathname === `/clients/${c.id}`
                  ? "bg-primary/15 text-primary glow-border"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Circle className="h-2 w-2 fill-current" />
              {c.name}
            </Link>
          ))}
        </div>

        <div className="pt-4">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              pathname === "/settings"
                ? "bg-primary/15 text-primary glow-border"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
            {user.name.charAt(0)}
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                checkedIn ? "bg-success" : "bg-muted-foreground"
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-[11px] capitalize text-muted-foreground">
              {user.role.replace("_", " ").toLowerCase()} · {checkedIn ? "Checked In" : "Checked Out"}
            </p>
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
    </aside>
  );
}
