"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Next.js's error boundary convention — catches a thrown error anywhere in
// this route group (a failed Prisma query, etc.) and renders this instead
// of the framework's raw error overlay. `reset()` re-renders the segment
// that threw, which is what actually re-runs the failed data fetch.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="glass flex max-w-sm flex-col items-center gap-3 rounded-2xl p-8 text-center shadow-card">
        <AlertTriangle className="h-8 w-8 text-danger" />
        <div>
          <p className="text-sm font-medium">Unable to load this page</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Something went wrong on our end. Your data is safe — try again.
          </p>
        </div>
        <Button onClick={() => reset()} className="mt-1">
          <RotateCw className="h-4 w-4" /> Retry
        </Button>
      </div>
    </div>
  );
}
