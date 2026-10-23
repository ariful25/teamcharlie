import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { permissions } from "@/lib/auth";
import { getTeamTimezone } from "@/lib/team-timezone";
import { startOfDayUTC } from "@/lib/time";
import { getPayroll } from "@/lib/payroll/service";
import { PayrollConsole } from "@/components/payroll/payroll-console";

export default async function PayrollPage({ searchParams }: { searchParams: { year?: string; month?: string; tab?: string } }) {
  const currentUser = await getCurrentUser();
  if (!permissions.canManagePayroll(currentUser.role)) redirect("/dashboard");

  const today = startOfDayUTC(new Date(), await getTeamTimezone(currentUser.teamId));
  const year = Number(searchParams.year) || today.getUTCFullYear();
  const monthParam = Number(searchParams.month);
  const month = Number.isInteger(monthParam) && monthParam >= 0 && monthParam <= 11 && searchParams.month !== undefined ? monthParam : today.getUTCMonth();
  const tab = searchParams.tab === "salaries" || searchParams.tab === "rules" ? searchParams.tab : "payroll";

  const payroll = await getPayroll(currentUser.teamId, year, month);
  return <PayrollConsole year={year} month={month} tab={tab} status={payroll.status} finalizedAt={payroll.finalizedAt} rows={payroll.rows} rules={payroll.rules} />;
}
