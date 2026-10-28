import { getScope } from "@/lib/scope";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDirectory } from "@/lib/people/queries";
import { PeopleDirectory } from "@/components/people/directory";
import { AddPeopleDialog } from "@/components/people/add-people-dialog";

export default async function PeoplePage() {
  const user = await getCurrentUser();
  const scope = await getScope(user);
  const canAdd = permissions.canAddPeople(user.role);
  const [{ people, departments }, extras] = await Promise.all([
    getDirectory(scope),
    canAdd
      ? Promise.all([
          prisma.squad.findMany({ where: { teamId: user.teamId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
          prisma.shiftType.findMany({ where: { teamId: user.teamId, active: true }, orderBy: { startTime: "asc" }, select: { id: true, name: true } }),
          prisma.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { name: true } }),
        ])
      : null,
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">People</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everyone on the team: what they do, who they report to and how to reach them.</p>
        </div>
        {extras && (
          <AddPeopleDialog
            actor={{ role: user.role, squadId: user.squadId }}
            squads={extras[0]}
            shiftTypes={extras[1]}
            companyName={extras[2].name}
            defaultSquadId={scope.squadId}
          />
        )}
      </div>
      <PeopleDirectory people={people} departments={departments} />
    </div>
  );
}
