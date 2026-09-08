"use client";

import { useState } from "react";
import { UserPlus, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "TEAM_LEAD", label: "Team Lead" },
  { value: "ADMIN", label: "Admin" },
];

export function AddUserModal({ shiftTypes }: { shiftTypes: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [defaultShiftTypeId, setDefaultShiftTypeId] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role, defaultShiftTypeId: defaultShiftTypeId || null }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) {
      setTempPassword(data.tempPassword);
      toast.success("User created");
    } else {
      toast.error(data.error ?? "Could not create user");
    }
  }

  function copyPassword() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      setTempPassword(null);
      setName("");
      setEmail("");
      setRole("EMPLOYEE");
      setDefaultShiftTypeId("");
      if (tempPassword) window.location.reload();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> Add User
        </Button>
      </DialogTrigger>
      <DialogContent title={tempPassword ? "User Created" : "Add User"}>
        {tempPassword ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this temporary password with <span className="font-medium text-foreground">{name}</span> — it
              won't be shown again. They should change it after logging in.
            </p>
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
              <code className="text-sm font-semibold tracking-wide text-primary">{tempPassword}</code>
              <button onClick={copyPassword} className="rounded-lg p-1.5 text-primary hover:bg-primary/15">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <Button className="w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
                placeholder="name@strassistance.com"
              />
            </Field>
            <Field label="Role">
              <Select value={role} onValueChange={setRole} options={ROLE_OPTIONS} />
            </Field>
            <Field label="Default Shift (optional)">
              <Select
                value={defaultShiftTypeId}
                onValueChange={setDefaultShiftTypeId}
                placeholder="None"
                options={[{ value: "", label: "None" }, ...shiftTypes.map((s) => ({ value: s.id, label: s.name }))]}
              />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Creating..." : "Create User"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
