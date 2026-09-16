import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

const toneClasses: Record<Tone, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-danger/15 text-danger border-danger/30",
  info: "bg-info/15 text-info border-info/30",
  neutral: "bg-muted text-muted-foreground border-border",
  primary: "bg-primary/15 text-primary border-primary/30",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "COMPLETED":
    case "STABLE":
    case "ON_TIME":
    case "CHECKED_OUT":
    case "WORKING":
    case "CURRENT":
    case "READY":
    case "EXPORTED":
      return "success";
    case "IN_PROGRESS":
    case "ATTENTION":
    case "LATE":
    case "WEEKEND":
    case "AIRBNB_TRANSITION":
    case "NEEDS_REVIEW":
      return "warning";
    case "OVERDUE":
    case "URGENT":
    case "BLOCKED":
    case "MISSING_CHECK_IN":
    case "MISSING_CHECK_OUT":
    case "LEAVE":
    case "FAILED":
      return "danger";
    case "WAITING":
    case "UPCOMING":
    case "CHECKED_IN":
    case "VACANT":
    case "PENDING":
    case "EXTRACTING":
      return "info";
    default:
      return "neutral";
  }
}

export function priorityTone(priority: string): Tone {
  if (priority === "URGENT") return "danger";
  if (priority === "IMPORTANT") return "warning";
  return "neutral";
}
