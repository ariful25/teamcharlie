"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Building2, Loader2, Lock, Mail, User } from "lucide-react";
import { AuthField } from "./auth-field";
import { FormError, submitButtonClass } from "./auth-card";
import { TimezoneSelect } from "./timezone-select";

export function SignupForm() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName, name, email, password, timezone }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create your team. Try again.");
      setLoading(false);
      return;
    }
    // Team + admin account exist now — sign straight in with the same
    // credentials rather than bouncing through /login.
    const login = await signIn("credentials", { email, password, rememberMe: "true", redirect: false });
    if (login?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <AuthField
        label="Team name"
        icon={Building2}
        value={teamName}
        onChange={setTeamName}
        required
        minLength={2}
        maxLength={60}
        autoComplete="organization"
        placeholder="e.g. Northwind Operations"
      />
      <AuthField label="Your name" icon={User} value={name} onChange={setName} required autoComplete="name" placeholder="Full name" />
      <AuthField
        label="Work email"
        icon={Mail}
        type="email"
        value={email}
        onChange={setEmail}
        required
        autoComplete="email"
        placeholder="you@company.com"
      />
      <AuthField
        label="Password"
        icon={Lock}
        type="password"
        value={password}
        onChange={setPassword}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <TimezoneSelect value={timezone} onChange={setTimezone} detectOnMount label="Team timezone" />

      <FormError message={error} />

      <button type="submit" disabled={loading} className={submitButtonClass}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Creating your team...
          </>
        ) : (
          "Create team"
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        You&apos;ll be the team&apos;s admin and can invite teammates from Settings.
      </p>
      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:brightness-110">
          Sign in
        </Link>
      </p>
    </form>
  );
}
