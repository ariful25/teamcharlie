"use client";

import dynamic from "next/dynamic";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { ClientNode } from "./charlie-hq-3d";

const CharlieHq3D = dynamic(() => import("./charlie-hq-3d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] w-full items-center justify-center text-sm text-muted-foreground">
      Loading visualization...
    </div>
  ),
});

export function CharlieHq3DWrapper({ nodes, teamName }: { nodes: ClientNode[]; teamName: string }) {
  return (
    // Hidden below lg breakpoint per spec: "Disable or simplify it on mobile devices."
    <Card className="hidden overflow-hidden lg:block">
      <CardHeader>
        <CardTitle>{teamName} live client map</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <CharlieHq3D nodes={nodes} teamName={teamName} />
      </CardContent>
    </Card>
  );
}
