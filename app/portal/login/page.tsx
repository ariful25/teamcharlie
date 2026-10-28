import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { PortalLoginForm } from "@/components/portal/portal-auth-forms";
import { getPortalUserOrNull } from "@/lib/portal/session";

export const metadata: Metadata = { title: "Owner portal" };

export default async function PortalLoginPage() {
  if (await getPortalUserOrNull()) redirect("/portal");
  return (
    <AuthCard title="Owner portal" subtitle="Your listings, reviews and property details, kept up to date by your property team.">
      <PortalLoginForm />
      <p className="mt-5 text-center text-xs text-muted-foreground">No account yet? Your property team sends you a link to set one up.</p>
    </AuthCard>
  );
}
