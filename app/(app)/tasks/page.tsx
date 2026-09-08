import { getCurrentUser } from "@/lib/session";
import { getTasksPageData } from "@/lib/queries/tasks";
import { TasksBoard } from "@/components/tasks/tasks-board";

export default async function TasksPage() {
  const currentUser = await getCurrentUser();

  const { tasks, clients, employees, categories } = await getTasksPageData(currentUser.teamId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">Today's task instances across all clients.</p>
      </div>
      <TasksBoard tasks={tasks} clients={clients} employees={employees} categories={categories} />
    </div>
  );
}
