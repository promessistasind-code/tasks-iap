import { type ReactNode } from "react"
import { useApp } from "@/context/AppContext"
import type { Task } from "@/types/task"
import { Pencil, Trash2 } from "lucide-react"
import { showConfirm } from "@/lib/confirm"

interface Props {
  task: Task
  onEdit: (task: Task) => void
  children: ReactNode
}

export function TaskContextMenu({ task, onEdit, children }: Props) {
  const { deleteTask } = useApp()

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    const ok = await showConfirm({
      title: `Excluir "${task.title}"?`,
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    })
    if (ok) deleteTask(task.id)
  }

  return (
    <div className="group relative">
      {children}
      <div
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
        onClick={e => e.stopPropagation()}
      >
        <button
          className="size-6 flex items-center justify-center rounded bg-background border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onEdit(task)}
          title="Editar"
        >
          <Pencil className="size-3" />
        </button>
        <button
          className="size-6 flex items-center justify-center rounded bg-background border hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          onClick={handleDelete}
          title="Excluir"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  )
}
