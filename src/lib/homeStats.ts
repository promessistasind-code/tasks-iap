import type { Task } from "../types/task"
export function homeStats(tasks: Task[], now = new Date()) {
  const day = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  const today = day(now)
  return {
    total: tasks.length,
    done: tasks.filter((t) => t.status === "done").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    overdue: tasks.filter(
      (t) => t.status !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today
    ).length,
    doneToday: tasks.filter(
      (t) =>
        t.status === "done" &&
        t.completedAt &&
        day(new Date(t.completedAt)) === today
    ).length,
  }
}
