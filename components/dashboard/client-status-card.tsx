"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Badge, statusTone } from "@/components/ui/badge";

export function ClientStatusCard({
  id,
  name,
  status,
  completedTasks,
  totalTasks,
  followUps,
}: {
  id: string;
  name: string;
  status: string;
  completedTasks: number;
  totalTasks: number;
  followUps: number;
}) {
  return (
    <Link href={`/clients/${id}`}>
      <motion.div
        whileHover={{ y: -3 }}
        className="glass rounded-2xl p-5 shadow-card transition-shadow hover:shadow-glow-sm cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide">{name}</h3>
          <Badge tone={statusTone(status)}>{status.charAt(0) + status.slice(1).toLowerCase().replace("_", " ")}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-lg font-semibold">
              {completedTasks}/{totalTasks}
            </p>
            <p className="text-[11px] text-muted-foreground">Tasks</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-info">{followUps}</p>
            <p className="text-[11px] text-muted-foreground">Follow-ups</p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
