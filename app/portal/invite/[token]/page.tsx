import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { PortalJoinForm } from "@/components/portal/portal-auth-forms";
import { findUsableClientInvite } from "@/lib/portal/invites";

export const metadata: Metadata = { title: "Set up your owner portal" };

export default async function PortalInvitePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invite = await findUsableClientInvite(token);
  if (!invite) {
    return (
      <AuthCard title="This link doesn't work" subtitle="It may have expired, been used already or been replaced by a newer one.">
        <p className="text-sm text-muted-foreground">Ask your property team for a new link, or sign in if you already set up your account.</p>
        <Link href="/portal/login" className="mt-5 inline-block text-sm font-medium text-primary hover:brightness-110">
          Go to sign in
        </Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={`${invite.client.name} owner portal`} subtitle="Choose a password to see your listings, reviews and property details.">
      <PortalJoinForm token={token} email={invite.email} name={invite.name} />
    </AuthCard>
  );
}
