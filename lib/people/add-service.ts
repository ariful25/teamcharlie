// Server-side ONLY. Adding one or many people from the Add people dialog.
// The rules (who may add whom, into which team) are pure in ./adding.ts.
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { INVITE_TTL_DAYS, newInviteToken } from "@/lib/invites";
import { placementError, type Role } from "./adding";

type Actor = { id: string; role: Role; teamId: string; squadId: string | null };
type Input = {
  people: { name: string; email: string }[];
  role: Role;
  squadId: string | null;
  defaultShiftTypeId?: string | null;
  method: "invite" | "password";
};
export type AddResult = { name: string; email: string; ok: boolean; link?: string; tempPassword?: string; error?: string };

export class AddPeopleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function tempPassword() {
  // 10 characters, easy to read out over a call or chat.
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

export async function addPeople(actor: Actor, input: Input, origin: string): Promise<AddResult[]> {
  const problem = placementError(actor, { role: input.role, squadId: input.squadId });
  if (problem) throw new AddPeopleError(problem, 403);
  if (input.squadId && !(await prisma.squad.findFirst({ where: { id: input.squadId, teamId: actor.teamId, active: true } }))) {
    throw new AddPeopleError("That team doesn't exist.");
  }
  if (input.defaultShiftTypeId && !(await prisma.shiftType.findFirst({ where: { id: input.defaultShiftTypeId, teamId: actor.teamId } }))) {
    throw new AddPeopleError("That shift doesn't exist.");
  }

  const emails = input.people.map((p) => p.email.toLowerCase());
  const taken = new Set((await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email));

  const results: AddResult[] = [];
  for (const person of input.people) {
    const email = person.email.toLowerCase();
    if (taken.has(email)) {
      results.push({ ...person, email, ok: false, error: "Already has an account" });
      continue;
    }
    if (input.method === "password") {
      const password = tempPassword();
      await prisma.user.create({
        data: {
          name: person.name,
          email,
          passwordHash: await bcrypt.hash(password, 10),
          role: input.role,
          teamId: actor.teamId,
          squadId: input.squadId,
          defaultShiftTypeId: input.defaultShiftTypeId ?? null,
        },
      });
      // Returned once, never stored or logged in plain text.
      results.push({ ...person, email, ok: true, tempPassword: password });
      continue;
    }
    // Re-inviting the same address replaces the old link instead of leaving two live ones.
    await prisma.teamInvite.updateMany({ where: { teamId: actor.teamId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    const { token, tokenHash } = newInviteToken();
    await prisma.teamInvite.create({
      data: {
        teamId: actor.teamId,
        email,
        name: person.name,
        role: input.role,
        squadId: input.squadId,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
        createdBy: actor.id,
      },
    });
    results.push({ ...person, email, ok: true, link: `${origin}/invite/${token}` });
  }
  return results;
}
