import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserOrNull } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PRODUCT_NAME } from "@/lib/brand";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: `Create a company · ${PRODUCT_NAME}` };

export default async function SignupPage() {
  // Already signed in — a second team would need a second account anyway.
  // Checked against the DB, not just the JWT: a session for a removed or
  // disabled user would otherwise bounce to /dashboard -> /login forever.
  const session = await getCurrentUserOrNull();
  if (session && (await prisma.user.findFirst({ where: { id: session.id, active: true }, select: { id: true } }))) {
    redirect("/dashboard");
  }

  return (
    <AuthCard title="Create your company" subtitle={`Start a new ${PRODUCT_NAME} workspace in under a minute. You can add teams inside it after.`}>
      <SignupForm />
    </AuthCard>
  );
}
