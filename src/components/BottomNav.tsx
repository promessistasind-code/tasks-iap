import { LayoutDashboard, CheckSquare, FolderKanban, Search, StickyNote, CalendarDays, Users } from "lucide-react"
import { cn } from "@/lib/utils"

import type { Page } from "@/types/navigation"

interface Props {
  page: Page
  onNavigate: (p: Page) => void
  onSearch: () => void
}

const BASE_ITEMS = [
  { id: "ministries" as Page, label: "Ministérios", Icon: Users },
  { id: "calendar" as Page,  label: "Calendário", Icon: CalendarDays },
  { id: "tasks" as Page,     label: "Tarefas",   Icon: CheckSquare },
  { id: "projects" as Page,  label: "Projetos",  Icon: FolderKanban },
  { id: "notes" as Page,     label: "Notas",     Icon: StickyNote },
  { id: "dashboard" as Page, label: "Dashboard", Icon: LayoutDashboard },
]

export function BottomNav({ page, onNavigate, onSearch }: Props) {
  const items = BASE_ITEMS
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t bg-background/95 backdrop-blur">
      {items.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-xs transition-colors",
            page === id ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Icon className={cn("size-5", page === id && "stroke-[2.5]")} />
          <span className="text-[10px] font-medium">{label}</span>
        </button>
      ))}
      <button
        onClick={onSearch}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-xs text-muted-foreground transition-colors"
      >
        <Search className="size-5" />
        <span className="text-[10px] font-medium">Buscar</span>
      </button>
    </nav>
  )
}
