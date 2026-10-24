import { NextRequest, NextResponse } from "next/server";
import { addDocument, addEmergencyContact, addEvent, deleteDocument, deleteEmergencyContact, deleteEvent } from "@/lib/people/service";
import { peopleActor, peopleErrorResponse } from "@/lib/people/http";

// Emergency contacts, document links and history entries on a profile.
// POST { type: "contact" | "document" | "event", ...fields }
// DELETE ?type=…&id=…

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
  const actor = await peopleActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { type?: string };
  try {
    if (body.type === "contact") return NextResponse.json({ item: await addEmergencyContact(actor, params.userId, body) });
    if (body.type === "document") return NextResponse.json({ item: await addDocument(actor, params.userId, body) });
    if (body.type === "event") return NextResponse.json({ item: await addEvent(actor, params.userId, body) });
    return NextResponse.json({ error: "Unknown item type" }, { status: 400 });
  } catch (err) {
    return peopleErrorResponse(err, "Could not save that.");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const actor = await peopleActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    if (type === "contact") await deleteEmergencyContact(actor, params.userId, id);
    else if (type === "document") await deleteDocument(actor, params.userId, id);
    else if (type === "event") await deleteEvent(actor, params.userId, id);
    else return NextResponse.json({ error: "Unknown item type" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return peopleErrorResponse(err, "Could not remove that.");
  }
}
