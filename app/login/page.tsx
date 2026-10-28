"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Radar, Lock, Mail, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AUTH_ERROR_ACCOUNT_DISABLED, AUTH_ERROR_TOO_MANY_ATTEMPTS } from "@/lib/auth-errors";
import { PRODUCT_NAME } from "@/lib/brand";
import { BrandPanel, FEATURES } from "@/components/auth/brand-panel";

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
          {PRODUCT_NAME} doesn&apos;t have self-service password resets yet. Your team admin manages accounts.
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
      toast.success(`You've been signed out. Thanks for using ${PRODUCT_NAME}.`);
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
          : res.error === AUTH_ERROR_TOO_MANY_ATTEMPTS
            ? "Too many failed attempts. Wait 15 minutes, then try again."
            : "Incorrect email or password."
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden flex-1 px-5 py-10 lg:min-h-0 lg:justify-end lg:px-0 lg:py-0">
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
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 glow-border">
            <Radar className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in to {PRODUCT_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your team&apos;s tasks, shifts and operations in one place.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
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
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
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

        <p className="mt-5 text-center text-xs text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-primary hover:brightness-110">
            Create a company
          </Link>{" "}
          or ask your admin for an invite link.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-5 lg:hidden">
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
