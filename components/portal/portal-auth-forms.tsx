"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { AuthField } from "@/components/auth/auth-field";
import { FormError, submitButtonClass } from "@/components/auth/auth-card";
import { AUTH_ERROR_ACCOUNT_DISABLED, AUTH_ERROR_TOO_MANY_ATTEMPTS } from "@/lib/auth-errors";

function loginError(code: string) {
  if (code === AUTH_ERROR_ACCOUNT_DISABLED) return "This portal account is turned off. Ask your property team.";
  if (code === AUTH_ERROR_TOO_MANY_ATTEMPTS) return "Too many attempts. Wait 15 minutes and try again.";
  return "That email and password don't match.";
}

export function PortalLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("client-credentials", { email, password, redirect: false });
    if (res?.error) {
      setError(loginError(res.error));
      setLoading(false);
      return;
    }
    router.push("/portal");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <AuthField label="Email" icon={Mail} type="email" value={email} onChange={setEmail} required autoComplete="email" placeholder="you@example.com" />
      <AuthField label="Password" icon={Lock} type="password" value={password} onChange={setPassword} required autoComplete="current-password" placeholder="Your password" />
      <FormError message={error} />
      <button type="submit" disabled={loading} className={submitButtonClass}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </button>
    </form>
  );
}

export function PortalJoinForm({ token, email, name: invitedName }: { token: string; email: string; name: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(invitedName ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/portal/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't set up your account. Try again.");
      setLoading(false);
      return;
    }
    const login = await signIn("client-credentials", { email, password, redirect: false });
    router.push(login?.error ? "/portal/login" : "/portal");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <AuthField label="Email" icon={Mail} type="email" value={email} onChange={() => {}} readOnly aria-readonly="true" />
      <AuthField label="Your name" icon={User} value={name} onChange={setName} required autoComplete="name" placeholder="Full name" />
      <AuthField
        label="Choose a password"
        icon={Lock}
        type="password"
        value={password}
        onChange={setPassword}
        required
        minLength={8}
        autoComplete="new-password"
        placeholder="At least 8 characters"
      />
      <FormError message={error} />
      <button type="submit" disabled={loading} className={submitButtonClass}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open my portal"}
      </button>
    </form>
  );
}
