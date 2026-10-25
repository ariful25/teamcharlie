import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { advanceStays } from "@/lib/reviews/service";
import { getReviewHub } from "@/lib/reviews/queries";
import { ReviewHub } from "@/components/reviews/review-hub";

export default async function ReviewsPage() {
  const user = await getCurrentUser();
  await advanceStays(user.teamId);
  const hub = await getReviewHub(user.teamId);
  return (
    <Suspense>
      <ReviewHub hub={hub} canManage={permissions.canManageKnowledgeBase(user.role)} />
    </Suspense>
  );
}
