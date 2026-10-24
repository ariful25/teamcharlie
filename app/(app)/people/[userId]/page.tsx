import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getProfile } from "@/lib/people/queries";
import { ProfileView } from "@/components/people/profile-view";

export default async function PersonPage({ params }: { params: { userId: string } }) {
  const user = await getCurrentUser();
  const data = await getProfile({ id: user.id, role: user.role, teamId: user.teamId }, params.userId);
  if (!data) notFound();

  return (
    <div className="space-y-5">
      <Link href="/people" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <ArrowLeft className="h-3 w-3" /> People
      </Link>
      <ProfileView data={data} />
    </div>
  );
}
