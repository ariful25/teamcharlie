import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkOut } from "@/lib/services/attendance";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const body = await req.json().catch(() => ({}));
  const checklist = Array.isArray(body.checklist) ? body.checklist : undefined;

  try {
    const record = await checkOut(userId, checklist);
    return NextResponse.json(record);
  } catch (err: any) {
    if (err.message === "NOT_CHECKED_IN") {
      return NextResponse.json({ error: "You haven't checked in yet." }, { status: 409 });
    }
    if (err.message === "ALREADY_CHECKED_OUT") {
      return NextResponse.json({ error: "You have already checked out today." }, { status: 409 });
    }
    if (err.message === "STALE_CHECK_IN") {
      return NextResponse.json(
        { error: "Your last check-in looks like it was missed. Ask an admin to correct it." },
        { status: 409 }
      );
    }
    if (err.message === "CHECKLIST_INCOMPLETE") {
      return NextResponse.json({ error: "Please confirm every checklist item before checking out." }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not check out. Please try again." }, { status: 500 });
  }
}
