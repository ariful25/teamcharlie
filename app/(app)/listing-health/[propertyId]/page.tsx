import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { getListingDetail } from "@/lib/listing-health/queries";
import { ListingDetail } from "@/components/listing-health/listing-detail";

export default async function ListingHealthDetailPage(props: { params: Promise<{ propertyId: string }> }) {
  const params = await props.params;
  const currentUser = await getCurrentUser();
  const data = await getListingDetail(currentUser.teamId, params.propertyId);
  if (!data) notFound();
  return <ListingDetail {...data} canManage={permissions.canManageKnowledgeBase(currentUser.role)} />;
}
