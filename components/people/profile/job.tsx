"use client";

import Link from "next/link";
import { useState } from "react";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DatePicker, formatYmd } from "@/components/ui/date-picker";
import { Field, inputClass } from "@/components/shared/form-field";
import type { ProfileData } from "@/lib/people/queries";
import { ROLE, EMPLOYMENT, LOCATION, useMutate, Section, EditButton, FactGrid, Stat, DialogActions } from "./shared";

export function JobTab({ data }: { data: ProfileData }) {
  const { job, access, person, pay } = data;
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-5">
      <Section title="Role and reporting" action={access.editJob && <EditButton onClick={() => setEditing(true)} />}>
        <FactGrid
          items={[
            ["Job title", job.jobTitle],
            ["Department", job.department],
            ["Manager", job.manager ? <Link href={`/people/${job.manager.id}`} className="text-primary hover:underline">{job.manager.name}</Link> : null],
            ["App role", ROLE[person.role]],
            ["Employment type", EMPLOYMENT[job.employmentType]],
            ["Work location", LOCATION[job.workLocation]],
            ["Start date", job.startDate ? `${formatYmd(job.startDate)}${job.tenure ? ` · ${job.tenure}` : ""}` : null],
            ["Probation ends", job.probationEndDate ? formatYmd(job.probationEndDate) : null],
            ["Employee ID", job.employeeCode],
            ["Usual shift", person.defaultShift],
          ]}
        />
      </Section>

      {pay && (
        <Section
          title="Pay"
          action={
            access.editJob ? (
              <Link href="/payroll" className="text-xs text-primary hover:underline">
                Change in Payroll
              </Link>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Monthly gross" value={`৳${pay.monthlyGross.toLocaleString("en-US")}`} />
            <Stat label="Basic" value={`৳${Math.round((pay.monthlyGross * pay.basicPercent) / 100).toLocaleString("en-US")}`} hint={`${pay.basicPercent}% of gross`} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Only {access.self ? "you and admins" : "admins and this person"} can see this.</p>
        </Section>
      )}

      {editing && <JobDialog data={data} onClose={() => setEditing(false)} />}
    </div>
  );
}

export function JobDialog({ data, onClose }: { data: ProfileData; onClose: () => void }) {
  const { job, person, teammates } = data;
  const { busy, run } = useMutate();
  const [f, setF] = useState({
    jobTitle: job.jobTitle ?? "",
    department: job.department ?? "",
    managerId: job.manager?.id ?? "",
    employmentType: job.employmentType as string,
    workLocation: job.workLocation as string,
    startDate: job.startDate ?? "",
    probationEndDate: job.probationEndDate ?? "",
    employeeCode: job.employeeCode ?? "",
  });
  async function save() {
    const ok = await run(
      `/api/people/${person.id}`,
      "PATCH",
      { ...f, managerId: f.managerId || null, startDate: f.startDate || null, probationEndDate: f.probationEndDate || null },
      "Job details saved"
    );
    if (ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Job details · ${person.name}`} className="max-w-xl">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job title">
              <input className={inputClass} value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} placeholder="Guest experience associate" />
            </Field>
            <Field label="Department">
              <input className={inputClass} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="Guest operations" />
            </Field>
            <Field label="Manager">
              <Select value={f.managerId} onValueChange={(v) => setF({ ...f, managerId: v })} options={[{ value: "", label: "No manager" }, ...teammates.map((t) => ({ value: t.id, label: t.name }))]} />
            </Field>
            <Field label="Employee ID">
              <input className={inputClass} value={f.employeeCode} onChange={(e) => setF({ ...f, employeeCode: e.target.value })} />
            </Field>
            <Field label="Employment type">
              <Select value={f.employmentType} onValueChange={(v) => setF({ ...f, employmentType: v })} options={Object.entries(EMPLOYMENT).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Work location">
              <Select value={f.workLocation} onValueChange={(v) => setF({ ...f, workLocation: v })} options={Object.entries(LOCATION).map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Start date">
              <DatePicker value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} />
            </Field>
            <Field label="Probation ends">
              <DatePicker value={f.probationEndDate} min={f.startDate || undefined} onChange={(v) => setF({ ...f, probationEndDate: v })} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">Changes are recorded in {person.name.split(" ")[0]}&apos;s history with your name.</p>
          <DialogActions busy={busy} onCancel={onClose} onSave={save} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
