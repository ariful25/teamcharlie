import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { findUsableInvite } from "@/lib/invites";
import { getCurrentUserOrNull } from "@/lib/session";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const metadata: Metadata = { title: `Join a team · ${PRODUCT_NAME}` };

export default async function InvitePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const [invite, currentUser] = await Promise.all([findUsableInvite(params.token), getCurrentUserOrNull()]);

  if (!invite) {
    return (
      <AuthCard title="Invite not available" subtitle="This link is invalid, has expired or was already used.">
        <p className="text-center text-sm text-muted-foreground">
          Ask your team admin to send a new invite from Settings → Members.
        </p>
        <Link
          href="/login"
          className="mt-5 block rounded-xl border border-border py-2.5 text-center text-sm font-medium transition hover:border-primary/40 hover:text-primary"
        >
          Go to sign in
        </Link>
      </AuthCard>
    );
  }

  if (currentUser) {
    return (
      <AuthCard title={`Join ${invite.team.name}`} subtitle="You're already signed in.">
        <p className="text-center text-sm text-muted-foreground">
          This invite is for <span className="font-medium text-foreground">{invite.email}</span>. Sign out first, then open
          the link again to create that account.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 block rounded-xl border border-border py-2.5 text-center text-sm font-medium transition hover:border-primary/40 hover:text-primary"
        >
          Back to dashboard
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${invite.team.name}`}
      subtitle={`You've been invited to ${invite.team.name} on ${PRODUCT_NAME}. Set up your account to get started.`}
    >
      <AcceptInviteForm token={params.token} email={invite.email} />
    </AuthCard>
  );
}
