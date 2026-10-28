// Who may add whom, and who may move or promote whom. Pure: unit-tested in
// scripts/test-people.ts. Used by the Add people dialog's routes and by the
// role/team changes in Settings, so both follow the same rules.
//
//               may add / change                         into team
// Admin         anyone, any role                          any
// HR            employees, team leads, HR (never Admin)   any
// Team lead     employees only                            their own team
// Employee      nobody                                    -
//
// Employees and team leads always belong to a team. Admin and HR are
// company-wide and never sit in one.

export type Role = "ADMIN" | "HR" | "TEAM_LEAD" | "EMPLOYEE";
type Actor = { role: Role; squadId: string | null };
type Placement = { role: Role; squadId: string | null };

export const companyWideRole = (role: Role) => role === "ADMIN" || role === "HR";

/** Which roles this actor can hand out, best default first. */
export function rolesActorCanGive(actor: Actor): Role[] {
  if (actor.role === "ADMIN") return ["EMPLOYEE", "TEAM_LEAD", "HR", "ADMIN"];
  if (actor.role === "HR") return ["EMPLOYEE", "TEAM_LEAD", "HR"];
  if (actor.role === "TEAM_LEAD") return ["EMPLOYEE"];
  return [];
}

/** Null when allowed, otherwise the reason in plain words. */
export function placementError(actor: Actor, target: Placement): string | null {
  if (!rolesActorCanGive(actor).includes(target.role)) {
    if (actor.role === "EMPLOYEE") return "Only admins, HR and team leads can add people.";
    if (actor.role === "TEAM_LEAD") return "Team leads add employees. Ask an admin or HR for other roles.";
    return "Only an admin can make someone an admin.";
  }
  if (companyWideRole(target.role)) return target.squadId ? "Admin and HR work across all teams, so they aren't put in one." : null;
  if (!target.squadId) return "Pick a team for this person.";
  if (actor.role === "TEAM_LEAD" && target.squadId !== actor.squadId) return "Team leads add people to their own team.";
  return null;
}

/** Changing an existing person: the actor must be allowed to place them both where they are now and where they're going. */
export function changeError(actor: Actor, before: Placement, after: Placement): string | null {
  if (actor.role === "TEAM_LEAD" || actor.role === "EMPLOYEE") return "Only admins and HR change roles and teams.";
  if (actor.role === "HR" && before.role === "ADMIN") return "Only an admin can change an admin.";
  return placementError(actor, after);
}

/** "Name, email" per line (also tabs or semicolons, either order). Bad lines come back with a reason. */
export function parsePeopleList(text: string) {
  const people: { name: string; email: string }[] = [];
  const problems: { line: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
    const email = parts.find((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
    const name = parts.find((p) => p !== email);
    if (!email) problems.push({ line, reason: "No email address" });
    else if (!name) problems.push({ line, reason: "No name" });
    else if (seen.has(email.toLowerCase())) problems.push({ line, reason: "Listed twice" });
    else {
      seen.add(email.toLowerCase());
      people.push({ name, email: email.toLowerCase() });
    }
  }
  return { people, problems };
}

/** A ready-to-send WhatsApp message for an invite (there's no email service, so people share links by chat). */
export function inviteMessage(name: string, companyName: string, link: string) {
  const first = name.split(/\s+/)[0] || name;
  return `Hi ${first}, you've been added to ${companyName} on TeamHQ. Set your password here: ${link} (the link works once and expires in 7 days).`;
}
