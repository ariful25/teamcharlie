import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkOut } from "@/lib/services/attendance";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;

  try {
    const record = await checkOut(userId);
    return NextResponse.json(record);
  } catch (err: any) {
    if (err.message === "NOT_CHECKED_IN") {
      return NextResponse.json({ error: "You haven't checked in yet." }, { status: 409 });
    }
    if (err.message === "ALREADY_CHECKED_OUT") {
      return NextResponse.json({ error: "You have already checked out today." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Could not check out. Please try again." }, { status: 500 });
  }
}
