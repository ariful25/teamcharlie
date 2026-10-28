import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFixTask } from "@/lib/listing-health/tasks";
import { listingHealthErrorResponse, requireListingManager } from "@/lib/listing-health/http";

const schema = z.object({
  key: z.string().min(1).max(80), // issue code, or "theme:<key>"
  assignedUserId: z.string().optional().nullable(),
});

// One click: Listing Health issue / complaint theme → a task in Tasks.
export async function POST(req: NextRequest, props: { params: Promise<{ propertyId: string }> }) {
  const params = await props.params;
  const auth = await requireListingManager({ propertyId: params.propertyId });
  if (auth.error) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const { task, existed } = await createFixTask({
      teamId: auth.user.teamId,
      actorId: auth.user.id,
      actorName: auth.user.name,
      propertyId: params.propertyId,
      ...parsed.data,
    });
    return NextResponse.json({ taskId: task.id, existed });
  } catch (err) {
    return listingHealthErrorResponse(err, "Could not create the task.");
  }
}
