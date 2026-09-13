"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  CalendarClock,
  ListChecks,
  Clock,
  AlertTriangle,
  Settings,
  Radar,
  LogOut,
  Circle,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const clients = [
  { name: "Andrea", id: "seed-client-andrea" },
  { name: "Allen", id: "seed-client-allen" },
  { name: "Shawn", id: "seed-client-shawn" },
  { name: "Perfect Stay", id: "seed-client-perfectstay" },
  { name: "Jack", id: "seed-client-jack" },
];

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/shift-schedule", label: "Shift Schedule", icon: CalendarClock },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/issues", label: "Issues", icon: AlertTriangle },
  { href: "/knowledge-base", label: "Knowledge Base", icon: FileSpreadsheet },
];

export function Sidebar({
  user,
  checkedIn,
}: {
  user: { name: string; role: string; avatarUrl?: string | null };
  checkedIn: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border glass md:flex">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 glow-border">
          <Radar className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">CHARLIE HQ</p>
          <p className="text-[11px] text-muted-foreground">STR Assistance</p>
        </div>
      </div>

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

        <div className="pt-4">
          <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Clients
          </p>
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
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
