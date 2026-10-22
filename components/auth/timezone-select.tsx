"use client";

import { useEffect, useId, useMemo } from "react";
import { inputClass } from "@/components/shared/form-field";

function allTimezones(current: string): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
  const list = supported && supported.length > 0 ? supported : ["UTC", "Asia/Dhaka", "Europe/London", "America/New_York"];
  return list.includes(current) ? list : [current, ...list];
}

/** Browser's own timezone — only call after mount (differs from the server). */
export function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Native <select>: ~400 IANA zones is too long for the custom Select popover.
export function TimezoneSelect({
  value,
  onChange,
  detectOnMount = false,
  label = "Timezone",
}: {
  value: string;
  onChange: (tz: string) => void;
  detectOnMount?: boolean;
  label?: string;
}) {
  const id = useId();
  const options = useMemo(() => allTimezones(value), [value]);

  useEffect(() => {
    if (detectOnMount) onChange(browserTimezone());
    // Run once: pre-select the visitor's own zone on the sign-up form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} py-2.5`}>
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
