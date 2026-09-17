"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Radar, Lock, Mail, Eye, EyeOff, Building2, ListChecks, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AUTH_ERROR_ACCOUNT_DISABLED } from "@/lib/auth-errors";

const FEATURES = [
  { icon: Building2, title: "Properties", body: "Every listing's knowledge base in one place" },
  { icon: ListChecks, title: "Tasks", body: "Keep your whole team aligned, every shift" },
  { icon: Users, title: "Teamwork", body: "Roles, permissions, and visibility that fit how you operate" },
];

function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-primary transition hover:brightness-110"
      >
        Forgot password?
      </button>
      <DialogContent title="Forgot your password?" className="max-w-sm">
        <p className="text-sm text-muted-foreground">
          Charlie HQ doesn&apos;t have self-service password resets yet — accounts are managed by your team admin.
          Reach out to them directly and they can issue you a new temporary password from Settings.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("signedOut")) {
      toast.success("You've been signed out. Thanks for using Charlie HQ.");
    } else if (searchParams.get("disabled")) {
      toast.error("Your account has been disabled. Contact your administrator.");
    }
    // Only ever meant to fire once, right after the redirect that set these
    // params — not on every re-render this component happens to do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      rememberMe: rememberMe ? "true" : "false",
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      setError(
        res.error === AUTH_ERROR_ACCOUNT_DISABLED
          ? "Your account has been disabled. Contact your administrator."
          : "Incorrect email or password."
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 lg:min-h-0 lg:flex-1 lg:justify-end lg:px-0 lg:py-0">
      <div className="pointer-events-none absolute inset-0 lg:hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-accent/20 blur-3xl animate-pulse-glow" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="glass glow-border relative z-10 w-full max-w-md rounded-3xl p-8 lg:mr-[8%] lg:max-w-sm xl:mr-[12%]"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 glow-border">
            <Radar className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in to Charlie HQ</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your properties, guests, and operations in one place.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 transition focus-within:glow-border">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Password
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 transition focus-within:glow-border">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="shrink-0 text-muted-foreground transition hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </motion.p>
          )}

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Remember me
            </label>
            <ForgotPasswordDialog />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don&apos;t have an account? Contact your administrator.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-5 lg:hidden">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex flex-col items-center gap-1 text-center">
              <f.icon className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-medium text-muted-foreground">{f.title}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[hsl(222_47%_4%)] lg:flex lg:w-[45%] lg:items-center lg:justify-start lg:px-16">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-[32rem] w-[32rem] rounded-full bg-primary/25 blur-[100px]" />
        <div className="absolute -bottom-24 -right-10 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-[100px]" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
          <pattern id="grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M 36 0 L 0 0 0 36" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-md"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Property Operations, Simplified</p>
        <h2 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight">
          Great stays start with great operations.
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Charlie HQ helps short-term rental teams stay organized, efficient, and guest-ready — one shared source of
          truth for every property, task, and teammate.
        </p>

        <div className="mt-10 space-y-5">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.1 }}
              className="flex items-start gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 glow-border">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <BrandPanel />
    </div>
  );
}
