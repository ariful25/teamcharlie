"use client";

import { useId, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, EyeOff } from "lucide-react";

// The icon-prefixed input used on /login, factored out for /signup and
// /invite. The label is wired to the input via htmlFor/id.
export function AuthField({
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  hint,
  ...inputProps
}: {
  label: string;
  icon: LucideIcon;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  hint?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange">) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 transition focus-within:glow-border">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          type={isPassword && reveal ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          {...inputProps}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            className="shrink-0 text-muted-foreground transition hover:text-foreground"
            aria-label={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
