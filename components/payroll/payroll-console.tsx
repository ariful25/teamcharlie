"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Lock, Unlock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { IconTooltip } from "@/components/ui/tooltip";
import { Field, inputClass } from "@/components/shared/form-field";
import { cn } from "@/lib/utils";
import type { PayrollRow } from "@/lib/payroll/service";
import type { PayrollRules } from "@/lib/payroll/calc";

type Tab = "payroll" | "salaries" | "rules";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function post(body: unknown) {
  const res = await fetch("/api/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed");
}

export function PayrollConsole({
  year,
  month,
  tab,
  status,
  finalizedAt,
  rows,
  rules,
}: {
  year: number;
  month: number;
  tab: Tab;
  status: "DRAFT" | "FINALIZED";
  finalizedAt: string | null;
  rows: PayrollRow[];
  rules: PayrollRules & { currency: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const money = (n: number) => `${rules.currency === "BDT" ? "৳" : `${rules.currency} `}${n.toLocaleString("en-US")}`;
  const go = (y: number, m: number, t: Tab = tab) => router.push(`${pathname}?year=${y}&month=${m}&tab=${t}`);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    go(d.getUTCFullYear(), d.getUTCMonth());
  };

  const paid = rows.filter((r) => r.breakdown);
  const totals = paid.reduce(
    (acc, r) => ({ gross: acc.gross + r.breakdown!.gross, ot: acc.ot + r.breakdown!.otPay, ded: acc.ded + r.breakdown!.deductions, adj: acc.adj + r.breakdown!.adjustment, net: acc.net + r.breakdown!.net }),
    { gross: 0, ot: 0, ded: 0, adj: 0, net: 0 }
  );
  const unresolved = rows.reduce((s, r) => s + r.unresolved, 0);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<PayrollRow | null>(null);

  async function act(body: unknown, success: string) {
    setBusy(true);
    try {
      await post(body);
      toast.success(success);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monthly pay from approved hours, approved overtime and leave. Admins only.</p>
        </div>
        <div className="flex items-center gap-2">
          <IconTooltip label="Previous month">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </IconTooltip>
          <span className="min-w-[140px] text-center text-sm font-medium">
            {MONTHS[month]} {year}
          </span>
          <IconTooltip label="Next month">
            <Button variant="outline" size="icon" aria-label="Next month" onClick={() => shift(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </div>
      </div>

      <div role="tablist" aria-label="Payroll views" className="flex gap-1 rounded-2xl border border-border bg-muted/20 p-1">
        {(
          [
            ["payroll", "Monthly payroll"],
            ["salaries", "Salaries"],
            ["rules", "Rules"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => go(year, month, id)}
            className={cn("flex-1 rounded-xl px-3 py-2 text-xs font-medium transition md:flex-none", tab === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "payroll" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label="Status" value={status === "FINALIZED" ? "Finalized" : "Draft"} hint={finalizedAt ? `on ${new Date(finalizedAt).toLocaleDateString()}` : "recalculates live"} />
            <Tile label="Gross" value={money(totals.gross)} />
            <Tile label="Overtime pay" value={money(totals.ot)} />
            <Tile label="Deductions" value={money(totals.ded)} />
            <Tile label="Net pay" value={money(totals.net)} />
          </div>

          {status === "DRAFT" && unresolved > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-5 py-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                {unresolved} shift(s) this month still need review, so their hours aren&apos;t confirmed.{" "}
                <Link href="/attendance/admin?tab=review" className="text-primary hover:underline">
                  Resolve them in Team Attendance
                </Link>{" "}
                before finalizing.
              </span>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>
                {MONTHS[month]} {year}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/payroll?year=${year}&month=${month}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-5 text-sm font-medium transition hover:bg-muted/40">
                  <Download className="h-4 w-4" /> Export CSV
                </a>
                {status === "FINALIZED" ? (
                  <Button variant="outline" disabled={busy} onClick={() => confirm("Reopen this month? Pay will recalculate from current attendance.") && act({ action: "reopen", year, month }, "Payroll reopened")}>
                    <Unlock className="h-4 w-4" /> Reopen
                  </Button>
                ) : (
                  <Button disabled={busy || unresolved > 0 || paid.length === 0} onClick={() => confirm("Finalize and lock this month's payroll?") && act({ action: "finalize", year, month }, "Payroll finalized")}>
                    <Lock className="h-4 w-4" /> Finalize
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-y border-border/60 text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Employee</th>
                    <th className="px-3 py-2.5 font-medium">Gross</th>
                    <th className="px-3 py-2.5 font-medium">OT hours</th>
                    <th className="px-3 py-2.5 font-medium">OT pay</th>
                    <th className="px-3 py-2.5 font-medium">Unpaid / absent</th>
                    <th className="px-3 py-2.5 font-medium">Late</th>
                    <th className="px-3 py-2.5 font-medium">Deductions</th>
                    <th className="px-3 py-2.5 font-medium">Adjustment</th>
                    <th className="px-3 py-2.5 font-medium">Net</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((r) => {
                    const b = r.breakdown;
                    return (
                      <tr key={r.userId} className="border-b border-border/40 last:border-0">
                        <td className="px-5 py-3 font-medium">
                          {r.name}
                          {r.unresolved > 0 && <Badge tone="warning" className="ml-2">{r.unresolved} to review</Badge>}
                        </td>
                        {!b ? (
                          <td colSpan={9} className="px-3 py-3 text-muted-foreground">
                            No salary set.{" "}
                            <button className="text-primary hover:underline" onClick={() => go(year, month, "salaries")}>
                              add one
                            </button>
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-3">{money(b.gross)}</td>
                            <td className="px-3 py-3">
                              {b.overtimeHours}
                              {b.holidayOvertimeHours ? ` + ${b.holidayOvertimeHours} hol.` : ""}
                            </td>
                            <td className="px-3 py-3">{money(b.otPay)}</td>
                            <td className="px-3 py-3">
                              {b.unpaidLeaveDays} / {b.absentDays}
                            </td>
                            <td className="px-3 py-3">{b.lateCount}</td>
                            <td className="px-3 py-3 text-danger">{b.deductions ? `−${money(b.deductions)}` : "·"}</td>
                            <td className="px-3 py-3">
                              {status === "DRAFT" ? <AdjustmentInput row={r} year={year} month={month} /> : b.adjustment ? money(b.adjustment) : "·"}
                            </td>
                            <td className="px-3 py-3 font-semibold">{money(b.net)}</td>
                            <td className="px-3 py-3">
                              <button className="text-xs text-primary hover:underline" onClick={() => setDetail(r)}>
                                Details
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {tab === "salaries" && <SalariesTable rows={rows} money={money} />}
      {tab === "rules" && <RulesForm rules={rules} />}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent title={detail ? `${detail.name} · ${MONTHS[month]} ${year}` : "Details"} className="max-w-md">
          {detail?.breakdown && (
            <dl className="space-y-1.5 text-sm">
              <Line label={`Gross (basic ${detail.basicPercent}%)`} value={`${money(detail.breakdown.gross)} (basic ${money(detail.breakdown.basic)})`} />
              <Line label="Hourly rate for OT" value={`${money(Math.round(detail.breakdown.hourlyRate))} (${rules.otBase === "BASIC" ? "basic" : "gross"} ÷ ${rules.otHoursPerMonth})`} />
              <Line
                label={`Overtime ${detail.breakdown.overtimeHours}h × ${rules.otMultiplier}${detail.breakdown.holidayOvertimeHours ? ` + holiday ${detail.breakdown.holidayOvertimeHours}h × ${rules.holidayOtMultiplier}` : ""}`}
                value={money(detail.breakdown.otPay)}
              />
              <Line label={`Daily rate (gross ÷ ${rules.dailyRateDivisor})`} value={money(Math.round(detail.breakdown.dailyRate))} />
              <Line label={`Unpaid leave ${detail.breakdown.unpaidLeaveDays} day(s)`} value={`−${money(detail.breakdown.unpaidDeduction)}`} />
              <Line label={`Absent ${detail.breakdown.absentDays} day(s)`} value={`−${money(detail.breakdown.absentDeduction)}`} />
              <Line
                label={`Late ${detail.breakdown.lateCount}× ${rules.lateDaysPerDeduction ? `(every ${rules.lateDaysPerDeduction} = 1 day)` : "(no deduction rule)"}`}
                value={`−${money(detail.breakdown.lateDeduction)}`}
              />
              <Line label={`Adjustment${detail.adjustmentNote ? `: ${detail.adjustmentNote}` : ""}`} value={money(detail.breakdown.adjustment)} />
              <div className="flex justify-between border-t border-border pt-2 font-semibold">
                <span>Net pay</span>
                <span>{money(detail.breakdown.net)}</span>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-card">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-3 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function AdjustmentInput({ row, year, month }: { row: PayrollRow; year: number; month: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(row.breakdown?.adjustment ?? 0));
  const [note, setNote] = useState(row.adjustmentNote ?? "");
  const dirty = Number(value) !== (row.breakdown?.adjustment ?? 0) || note !== (row.adjustmentNote ?? "");
  async function save() {
    try {
      await post({ action: "adjust", year, month, userId: row.userId, amount: Math.round(Number(value) || 0), note: note || null });
      toast.success("Adjustment saved");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  }
  return (
    <div className="flex items-center gap-1">
      <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" aria-label={`Adjustment for ${row.name}`} className={`${inputClass} h-8 w-24 text-xs`} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note" aria-label={`Adjustment note for ${row.name}`} className={`${inputClass} h-8 w-24 text-xs`} />
      {dirty && (
        <button onClick={save} className="text-xs text-primary hover:underline">
          Save
        </button>
      )}
    </div>
  );
}

function SalariesTable({ rows, money }: { rows: PayrollRow[]; money: (n: number) => string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Salaries</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">Monthly gross and the share that is basic salary (overtime is calculated from basic by default).</p>
        {rows.map((r) => (
          <SalaryRow key={r.userId} row={r} money={money} />
        ))}
      </CardContent>
    </Card>
  );
}

function SalaryRow({ row, money }: { row: PayrollRow; money: (n: number) => string }) {
  const router = useRouter();
  const [gross, setGross] = useState(row.monthlyGross !== null ? String(row.monthlyGross) : "");
  const [basic, setBasic] = useState(String(row.basicPercent ?? 60));
  const dirty = gross !== (row.monthlyGross !== null ? String(row.monthlyGross) : "") || basic !== String(row.basicPercent ?? 60);
  async function save() {
    try {
      await post({ action: "salary", userId: row.userId, monthlyGross: Math.round(Number(gross)), basicPercent: Math.round(Number(basic)) });
      toast.success(`Salary saved for ${row.name}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  }
  return (
    <div className="grid grid-cols-[1fr_140px_100px_auto] items-center gap-2 border-b border-border/40 py-2 text-sm last:border-0">
      <span className="font-medium">{row.name}</span>
      <input value={gross} onChange={(e) => setGross(e.target.value)} inputMode="numeric" placeholder="Monthly gross" aria-label={`Monthly gross for ${row.name}`} className={`${inputClass} h-9`} />
      <input value={basic} onChange={(e) => setBasic(e.target.value)} inputMode="numeric" aria-label={`Basic percent for ${row.name}`} className={`${inputClass} h-9`} />
      <Button size="sm" disabled={!dirty || !gross} onClick={save}>
        Save
      </Button>
      {row.monthlyGross !== null && <span className="col-span-4 -mt-1 text-xs text-muted-foreground">Basic {money(Math.round((row.monthlyGross * (row.basicPercent ?? 60)) / 100))}</span>}
    </div>
  );
}

function RulesForm({ rules }: { rules: PayrollRules & { currency: string } }) {
  const router = useRouter();
  const [r, setR] = useState(rules);
  const set = (k: keyof typeof r, v: string) => setR((prev) => ({ ...prev, [k]: k === "otBase" || k === "currency" ? v : Number(v) }));
  async function save() {
    try {
      await post({ action: "rules", ...r });
      toast.success("Payroll rules saved");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payroll rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Overtime rate (normal days)">
            <input value={r.otMultiplier} onChange={(e) => set("otMultiplier", e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Overtime rate (public holidays)">
            <input value={r.holidayOtMultiplier} onChange={(e) => set("holidayOtMultiplier", e.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Overtime based on">
            <Select value={r.otBase} onValueChange={(v) => set("otBase", v)} options={[{ value: "BASIC", label: "Basic salary" }, { value: "GROSS", label: "Gross salary" }]} />
          </Field>
          <Field label="Working hours per month (OT hourly rate)">
            <input value={r.otHoursPerMonth} onChange={(e) => set("otHoursPerMonth", e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Days per month (daily deduction rate)">
            <input value={r.dailyRateDivisor} onChange={(e) => set("dailyRateDivisor", e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Late days per 1-day deduction (0 = off)">
            <input value={r.lateDaysPerDeduction} onChange={(e) => set("lateDaysPerDeduction", e.target.value)} className={inputClass} inputMode="numeric" />
          </Field>
          <Field label="Currency">
            <input value={r.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} className={inputClass} />
          </Field>
        </div>
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs">
          Check these with your accountant. Bangladesh&apos;s Labour Act sets overtime at twice the basic wage; the defaults here follow your
          overtime form (1.5× normal days, 2× public holidays).
        </p>
        <div className="flex justify-end">
          <Button onClick={save}>Save rules</Button>
        </div>
      </CardContent>
    </Card>
  );
}
