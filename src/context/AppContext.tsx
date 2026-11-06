import { createContext, useContext } from "react"
import type { Task, Project, Status, Member } from "@/types/task"
import type { AppNotification } from "@/types/notification"
import type { Note } from "@/types/note"

import type { MinistryWorkspace } from "@/store/useMinistriesStore"

interface AppContextValue {
  ministries: MinistryWorkspace[]
  ministryCatalog: MinistryWorkspace[]
  ministriesLoading: boolean
  ministriesError: string | null
  reloadMinistries: () => void
  tasks: Task[]
  projects: Project[]
  creatableMinistries: {id: string; name: string}[]
  canEditTask: (task: Task) => boolean
  canCommentTask: (task: Task) => boolean
  canCreateTask: (projectId: string) => boolean
  loading: boolean
  saving: boolean
  loadError: string | null
  reloadTasks: () => Promise<void>
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
  addTask: (task: Omit<Task, "id" | "createdAt" | "comments" | "checklist" | "activity" | "links">) => Promise<Task | undefined>
  reorderTasks: (orderedIds: string[]) => Promise<void>
  updateTask: (id: string, patch: Partial<Task>, activityText?: string) => Promise<boolean>
  deleteTask: (id: string) => void
  deleteTasks: (ids: string[]) => Promise<boolean>
  updateTasks: (ids: string[], patch: Partial<Task>) => Promise<boolean>
  moveTask: (id: string, status: Status) => Promise<boolean>
  addComment: (taskId: string, text: string) => Promise<boolean>
  deleteComment: (taskId: string, commentId: string) => void
  addChecklistItem: (taskId: string, text: string) => void
  toggleChecklistItem: (taskId: string, itemId: string) => void
  updateChecklistItem: (taskId: string, itemId: string, text: string) => void
  deleteChecklistItem: (taskId: string, itemId: string) => void
  reorderChecklist: (taskId: string, orderedIds: string[]) => Promise<void>
  addProject: (project: Omit<Project, "id" | "createdBy" | "suspended">) => Promise<Project | undefined>
  updateProject: (id: string, patch: Partial<Project>) => Promise<boolean>
  deleteProject: (id: string) => Promise<boolean>
  addTaskLink: (taskId: string, title: string, url: string) => void
  deleteTaskLink: (taskId: string, linkId: string) => void
  duplicateTask: (id: string) => Promise<Task | undefined>
  // Members (perfis reais — só leitura aqui; gestão de conta fica em UsersPage)
  members: Member[]
  membersLoading: boolean
  refetchMembers: () => Promise<void>
  // Notificações
  notifications: AppNotification[]
  notificationsLoading: boolean
  sendProjectInvite: (recipientId: string, projectId: string) => Promise<boolean>
  cancelInvite: (recipientId: string, projectId: string) => Promise<boolean>
  acceptInvite: (notification: AppNotification) => Promise<boolean>
  dismissNotification: (id: string) => Promise<boolean>
  // Notas
  notes: Note[]
  notesLoading: boolean
  noteTags: string[]
  createNote: (template?: string, initialTags?: string[]) => Promise<Note | undefined>
  updateNote: (id: string, patch: Partial<Pick<Note, "title" | "content" | "color" | "pinned" | "tags">>) => Promise<boolean>
  deleteNote: (id: string) => Promise<boolean>
  toggleNotePin: (id: string) => Promise<void>
}

export const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
