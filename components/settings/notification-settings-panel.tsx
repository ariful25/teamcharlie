"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

// Shared by the Discord and Slack integration cards on Settings — same
// shape (check-in/check-out connection status + test buttons), just a
// different test endpoint and help text per platform.
export function NotificationSettingsPanel({
  testEndpoint,
  checkinConfigured,
  checkoutConfigured,
  helpText,
}: {
  testEndpoint: string;
  checkinConfigured: boolean;
  checkoutConfigured: boolean;
  helpText: React.ReactNode;
}) {
  const [testing, setTesting] = useState<string | null>(null);

  async function test(kind: "checkin" | "checkout") {
    setTesting(kind);
    const res = await fetch(testEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    setTesting(null);
    if (res.ok) {
      toast.success(`Test ${kind} notification sent`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Test notification failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-border p-5">
        <div>
          <p className="text-sm font-medium">Check-in Connection</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {checkinConfigured ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-success">Connected</span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Not Connected</span>
              </>
            )}
          </div>
        </div>
        <Button size="sm" variant="secondary" disabled={testing === "checkin"} onClick={() => test("checkin")}>
          {testing === "checkin" ? "Sending..." : "Test Check-In Notification"}
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border p-5">
        <div>
          <p className="text-sm font-medium">Check-out Connection</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {checkoutConfigured ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-success">Connected</span>
              </>
            ) : (
              <>
                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Not Connected</span>
              </>
            )}
          </div>
        </div>
        <Button size="sm" variant="secondary" disabled={testing === "checkout"} onClick={() => test("checkout")}>
          {testing === "checkout" ? "Sending..." : "Test Check-Out Notification"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{helpText}</p>
    </div>
  );
}
