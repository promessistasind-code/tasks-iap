import type { Task, Project, Status, Comment, ChecklistItem, ActivityEntry, Recurring, TaskLink } from "@/types/task"

export function mapProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    emoji: row.emoji as string,
    suspended: !!row.suspended,
    createdBy: (row.created_by as string) ?? null,
    ministryId: (row.ministry_id as string) ?? null,
    memberIds: ((row.lt_project_members as { user_id: string }[] | undefined) ?? []).map(m => m.user_id),
  }
}

export function mapTask(
  row: Record<string, unknown>,
  comments: Comment[],
  checklist: ChecklistItem[],
  activity: ActivityEntry[],
  links: TaskLink[],
): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? "",
    status: row.status as Status,
    priority: row.priority as Task["priority"],
    projectId: (row.project_id as string) ?? "",
    dueDate: row.due_date ? (row.due_date as string) : null,
    tags: (row.tags as string[]) ?? [],
    recurring: (row.recurring as Recurring) ?? null,
    position: (row.position as number) ?? 0,
    completedAt: (row.completed_at as string) ?? null,
    createdAt: row.created_at as string,
    comments,
    checklist,
    activity,
    links,
    assignee: (row.assignee as string) ?? null,
    assigneeId: (row.assignee_id as string) ?? null,
    teamIds: (row.team_ids as string[]) ?? [],
    createdBy: (row.created_by as string) ?? null,
  }
}

export function mapComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    text: row.text as string,
    authorId: (row.author_id as string) ?? null,
    createdAt: row.created_at as string,
  }
}

export function mapChecklist(row: Record<string, unknown>): ChecklistItem {
  return { id: row.id as string, text: row.text as string, done: row.done as boolean }
}

export function mapActivity(row: Record<string, unknown>): ActivityEntry {
  return { id: row.id as string, text: row.text as string, createdAt: row.created_at as string }
}

export function mapTaskLink(row: Record<string, unknown>): TaskLink {
  return { id: row.id as string, title: row.title as string, url: row.url as string }
}
