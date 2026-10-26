"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PushToggle, signOutOfDevice } from "@/components/pwa/push";
import * as Sheet from "@radix-ui/react-dialog";
import {
  LayoutDashboard,
  CalendarClock,
  ListChecks,
  Clock,
  StickyNote,
  Users,
  FileSpreadsheet,
  HeartPulse,
  Star,
  ShieldCheck,
  Wallet,
  Building2,
  Settings,
  Menu,
  X,
  LogOut,
  Download,
  Share,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { permissions, type AppRole } from "@/lib/auth";
import { useInstallState } from "@/components/pwa/install";

// The four things the team does from a phone get a tab each; everything
// else lives under More. "Time" is the attendance page: check in/out,
// missed punches and leave.
const tabs = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/attendance", label: "Time", icon: Clock, exact: true },
  { href: "/notices", label: "Notices", icon: StickyNote },
];

function moreItems(role: AppRole) {
  return [
    { href: "/shift-schedule", label: "Shift schedule", icon: CalendarClock },
    { href: "/people", label: "People", icon: Users },
    { href: "/knowledge-base", label: "Knowledge base", icon: FileSpreadsheet },
    { href: "/listing-health", label: "Listing health", icon: HeartPulse },
    { href: "/reviews", label: "Reviews", icon: Star },
    ...(permissions.canEditAttendance(role) ? [{ href: "/attendance/admin", label: "Team attendance", icon: ShieldCheck }] : []),
    ...(permissions.canManagePayroll(role) ? [{ href: "/payroll", label: "Payroll", icon: Wallet }] : []),
    { href: "/clients", label: "Clients", icon: Building2 },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
}

const isActive = (pathname: string | null, href: string, exact?: boolean) =>
  !!pathname && (exact ? pathname === href || (pathname.startsWith(`${href}/`) && !pathname.startsWith("/attendance/admin")) : pathname.startsWith(href));

export function MobileNav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const more = moreItems(role);
  const moreActive = more.some((i) => isActive(pathname, i.href));

  useEffect(() => setOpen(false), [pathname]);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border glass pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((t) => (
        <Tab key={t.href} href={t.href} label={t.label} icon={t.icon} active={isActive(pathname, t.href, t.exact)} />
      ))}
      <Sheet.Root open={open} onOpenChange={setOpen}>
        <Sheet.Trigger className={cn("flex min-h-[55px] flex-col items-center justify-center gap-0.5 text-[11px]", moreActive || open ? "text-primary" : "text-muted-foreground")}>
          <Menu className="h-5 w-5" />
          More
        </Sheet.Trigger>
        <Sheet.Portal>
          <Sheet.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" />
          <Sheet.Content className="glass glow-border fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl p-5 pb-[calc(21px+env(safe-area-inset-bottom))] data-[state=open]:animate-fade-up md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <Sheet.Title className="text-base font-semibold">More</Sheet.Title>
              <Sheet.Close aria-label="Close" className="rounded-lg p-2 text-muted-foreground hover:bg-muted/50">
                <X className="h-4 w-4" />
              </Sheet.Close>
            </div>
            <Sheet.Description className="sr-only">Every other page, installing the app, notifications and signing out</Sheet.Description>
            <ul className="grid grid-cols-3 gap-3">
              {more.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className={cn(
                      "flex h-full flex-col items-center gap-2 rounded-xl border border-border px-2 py-3 text-center text-xs",
                      isActive(pathname, i.href) ? "bg-primary/15 text-primary glow-border" : "bg-muted/20 text-foreground"
                    )}
                  >
                    <i.icon className="h-5 w-5" />
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-5 space-y-2">
              <InstallRow />
              <PushToggle />
              <button
                onClick={signOutOfDevice}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-muted-foreground hover:bg-muted/50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </Sheet.Content>
        </Sheet.Portal>
      </Sheet.Root>
    </nav>
  );
}

function Tab({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Clock; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("flex min-h-[55px] flex-col items-center justify-center gap-0.5 text-[11px]", active ? "text-primary" : "text-muted-foreground")}
    >
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
}

function InstallRow() {
  const state = useInstallState();
  if (state.kind === "prompt")
    return (
      <button onClick={state.install} className="flex w-full items-center gap-3 rounded-xl bg-primary/15 px-3 py-3 text-sm text-primary glow-border">
        <Download className="h-4 w-4" /> Install the app on this phone
      </button>
    );
  if (state.kind === "ios")
    return (
      <p className="flex items-start gap-3 rounded-xl bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
        <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          To install: tap <b className="text-foreground">Share</b> in Safari, then <b className="text-foreground">Add to Home Screen</b>.
        </span>
      </p>
    );
  return null;
}
