"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { AuthField } from "./auth-field";
import { FormError, submitButtonClass } from "./auth-card";

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not accept the invite. Try again.");
      setLoading(false);
      return;
    }
    const login = await signIn("credentials", { email, password, rememberMe: "true", redirect: false });
    if (login?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Joining...
          </>
        ) : (
          "Join team"
        )}
      </button>
    </form>
  );
}
