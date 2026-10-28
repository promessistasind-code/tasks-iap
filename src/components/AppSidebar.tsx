import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { useApp } from "@/context/AppContext"
import type { Status } from "@/types/task"
import { LayoutDashboard, CheckSquare, FolderKanban, StickyNote, LayoutList, ChevronLeft, ChevronRight, Users, Settings, CalendarDays } from "lucide-react"
import { ProjectIcon } from "@/components/ProjectIcon"

function CollapseButton() {
  const { toggleSidebar, open } = useSidebar()
  return (
    <button
      onClick={toggleSidebar}
      className="w-full h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-border"
      title={open ? "Recolher menu" : "Expandir menu"}
    >
      {open ? <ChevronLeft className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
    </button>
  )
}

import type { Page } from "@/types/navigation"

interface Props {
  page: Page
  onNavigate: (p: Page) => void
  selectedMinistryId: string | null
  onSelectMinistry: (id: string | null) => void
  isAdmin: boolean
}

const ACTIVE_STATUSES: Status[] = ["todo", "in-progress", "review"]

export function AppSidebar({ page, onNavigate, isAdmin, selectedMinistryId, onSelectMinistry }: Props) {
  const { tasks, projects, activeProjectId, setActiveProjectId, ministries } = useApp()

  const activeTasks = tasks.filter(t => ACTIVE_STATUSES.includes(t.status)).length

  function handleProjectClick(projectId: string) {
    if (activeProjectId === projectId) {
      setActiveProjectId(null)
    } else {
      setActiveProjectId(projectId)
      onNavigate("tasks")
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex flex-col gap-2 px-2 py-1">
          <div className="flex items-center gap-2">
            <img src="/logo.jpg" alt="" className="size-8 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">Promessa Industrial</p>
              <p className="text-xs text-muted-foreground">Gestão de Projetos</p>
            </div>
          </div>
          <div
            className="h-[3px] rounded-full group-data-[collapsible=icon]:hidden"
            style={{ background: "linear-gradient(90deg, var(--brand-blue) 0%, var(--brand-orange) 100%)" }}
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "calendar"}
                onClick={() => { onNavigate("calendar"); setActiveProjectId(null) }}
              >
                <CalendarDays />
                <span>Calendário</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "tasks" && !activeProjectId}
                onClick={() => { onNavigate("tasks"); setActiveProjectId(null) }}
              >
                <CheckSquare />
                <span>Tarefas</span>
                {activeTasks > 0 && (
                  <Badge variant="secondary" className="ml-auto text-xs py-0 px-1.5 h-5">
                    {activeTasks}
                  </Badge>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "projects"}
                onClick={() => { onNavigate("projects"); setActiveProjectId(null) }}
              >
                <FolderKanban />
                <span>Projetos</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "notes"}
                onClick={() => { onNavigate("notes"); setActiveProjectId(null) }}
              >
                <StickyNote />
                <span>Notas</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "dashboard"}
                onClick={() => { onNavigate("dashboard"); setActiveProjectId(null) }}
              >
                <LayoutDashboard />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>

          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Ministérios</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton isActive={page === "ministries" && !selectedMinistryId} onClick={() => onSelectMinistry(null)}><Users/><span>Visão dos ministérios</span></SidebarMenuButton></SidebarMenuItem>
            {ministries.map(m => <SidebarMenuItem key={m.id}><SidebarMenuButton title={m.name} isActive={page === "ministries" && selectedMinistryId === m.id} onClick={() => onSelectMinistry(m.id)}><Users/><span className="truncate">{m.name}</span></SidebarMenuButton></SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Projetos</SidebarGroupLabel>
          <SidebarMenu>
            {/* Todos */}
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={page === "tasks" && !activeProjectId}
                onClick={() => { setActiveProjectId(null); onNavigate("tasks") }}
                className="gap-2"
              >
                <LayoutList className="size-4 shrink-0" />
                <span>Todos</span>
                {activeTasks > 0 && <span className="ml-auto text-xs text-muted-foreground">{activeTasks}</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
            {projects.map(p => {
              const count = tasks.filter(t => t.projectId === p.id && ACTIVE_STATUSES.includes(t.status)).length
              const isActive = activeProjectId === p.id
              return (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton isActive={isActive} onClick={() => handleProjectClick(p.id)} className="gap-2">
                    <ProjectIcon iconKey={p.emoji} className="size-4 shrink-0" style={{ color: p.color }} />
                    <span className="truncate">{p.name}</span>
                    {count > 0 && <span className="ml-auto text-xs text-muted-foreground">{count}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />

        {(
          <SidebarGroup>
            <SidebarGroupLabel>Pessoas</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === "users"}
                  onClick={() => { onNavigate("users"); setActiveProjectId(null) }}
                >
                  <Users />
                  <span>Pessoas e usuários</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={page === "settings"}
                  onClick={() => { onNavigate("settings"); setActiveProjectId(null) }}
                >
                  <Settings />
                  <span>Configurações</span>
                </SidebarMenuButton>
              </SidebarMenuItem>}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {tasks.filter(t => t.status === "done").length} de {tasks.length} tarefas concluídas
        </div>
        <CollapseButton />
      </SidebarFooter>
    </Sidebar>
  )
}
