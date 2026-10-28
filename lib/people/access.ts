// Who can see and change what on an employee profile. Pure — unit-tested in
// scripts/test-people.ts.
//
//              job/about   personal   emergency   documents   pay    time   private notes
// self            view      edit       edit        view+add    view   view   —
// team lead       view      —          view        —           —      view   —
// admin, HR       edit      edit       edit        edit        view   view   edit
// teammate        view      —          —           —           —      —      —
//
// A lead or teammate only ever reaches profiles in their own team: the
// queries in lib/people/ 404 anyone outside it (lib/scope.ts).

export type Viewer = { id: string; role: string };

export function profileAccess(viewer: Viewer, subjectId: string) {
  const admin = viewer.role === "ADMIN" || viewer.role === "HR";
  const lead = viewer.role === "TEAM_LEAD";
  const self = viewer.id === subjectId;
  return {
    self,
    editJob: admin,
    editAbout: admin || self,
    viewPersonal: admin || self,
    editPersonal: admin || self,
    viewEmergency: admin || self || lead,
    editEmergency: admin || self,
    viewDocuments: admin || self,
    addDocuments: admin || self,
    viewPay: admin || self,
    viewTime: admin || lead || self,
    viewPrivateEvents: admin,
    addPraise: (admin || lead) && !self,
    addNoteOrWarning: admin && !self,
  };
}

export type ProfileAccess = ReturnType<typeof profileAccess>;

/** Fields a person may change on their own profile; everything else is admin-only. */
export const SELF_FIELDS = ["preferredName", "bio", "skills", "languages", "phone", "whatsapp", "personalEmail", "dateOfBirth", "address", "bloodGroup"] as const;
export const JOB_FIELDS = ["employeeCode", "jobTitle", "department", "managerId", "employmentType", "workLocation", "startDate", "probationEndDate"] as const;

export function editableFields(access: ProfileAccess): string[] {
  return [...(access.editAbout ? SELF_FIELDS : []), ...(access.editJob ? JOB_FIELDS : [])];
}

/** Would making `managerId` the manager of `userId` create a reporting loop? */
export function createsManagerLoop(userId: string, managerId: string | null, managerOf: Map<string, string | null>) {
  let cur = managerId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === userId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = managerOf.get(cur) ?? null;
  }
  return false;
}

/** Whole months and remaining days between two calendar days, e.g. "2 yrs 3 mos". */
export function tenure(start: Date, today: Date) {
  let months = (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + (today.getUTCMonth() - start.getUTCMonth());
  if (today.getUTCDate() < start.getUTCDate()) months--;
  if (months < 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) {
    const days = Math.round((today.getTime() - start.getTime()) / 86_400_000);
    return days <= 0 ? "Starts today" : `${days} day${days === 1 ? "" : "s"}`;
  }
  return [y ? `${y} yr${y === 1 ? "" : "s"}` : null, m ? `${m} mo${m === 1 ? "" : "s"}` : null].filter(Boolean).join(" ");
}

/** Days until the next birthday (0 = today). Uses month/day only. */
export function daysUntilBirthday(dob: Date, today: Date) {
  const y = today.getUTCFullYear();
  let next = Date.UTC(y, dob.getUTCMonth(), dob.getUTCDate());
  const t = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  if (next < t) next = Date.UTC(y + 1, dob.getUTCMonth(), dob.getUTCDate());
  return Math.round((next - t) / 86_400_000);
}
