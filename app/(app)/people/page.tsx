import { getCurrentUser } from "@/lib/session";
import { getDirectory } from "@/lib/people/queries";
import { PeopleDirectory } from "@/components/people/directory";

export default async function PeoplePage() {
  const user = await getCurrentUser();
  const { people, departments } = await getDirectory(user.teamId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everyone on the team: what they do, who they report to and how to reach them.</p>
      </div>
      <PeopleDirectory people={people} departments={departments} />
    </div>
  );
}
