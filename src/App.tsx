import { useState, useEffect } from "react"
import { AppProvider } from "@/context/AppContext"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { LoginPage } from "@/pages/LoginPage"
import { AppSidebar } from "@/components/AppSidebar"
import { BottomNav } from "@/components/BottomNav"
import { DashboardPage } from "@/pages/DashboardPage"
import { TasksPage } from "@/pages/TasksPage"
import { MinistriesPage } from "@/pages/MinistriesPage"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { NotesPage } from "@/pages/NotesPage"
import { CalendarPage } from "@/pages/CalendarPage"
import { UsersPage } from "@/pages/UsersPage"
import { AccountOnboarding } from "@/components/AccountOnboarding"
import { SettingsPage } from "@/pages/SettingsPage"
import { JarvisPanel } from "@/components/jarvis/JarvisPanel"
import { TaskDetailSheet } from "@/components/TaskDetailSheet"
import { CommandPalette } from "@/components/CommandPalette"
import { ConfirmDialogProvider } from "@/components/ConfirmDialog"
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useTheme } from "@/components/theme-provider"
import { useApp } from "@/context/AppContext"
import { MemberAvatar } from "@/components/MemberAvatar"
import { NotificationBell } from "@/components/NotificationBell"
import { Toaster, toast } from "sonner"
import { Sun, Moon, Monitor, Search, Loader2, Bot, User, ChevronsUpDown, LogOut } from "lucide-react"
import { isToday, parseISO } from "date-fns"

import type { Page } from "@/types/navigation"

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const icons = { light: <Sun className="size-4" />, dark: <Moon className="size-4" />, system: <Monitor className="size-4" /> }
  const next: Record<string, typeof theme> = { light: "dark", dark: "system", system: "light" }
  return (
    <Button variant="ghost" size="icon" className="size-8" onClick={() => setTheme(next[theme])}>
      {icons[theme]}
    </Button>
  )
}

function UserMenu() {
  const { profile, signOut } = useAuth()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 h-8 pl-1 pr-1.5 rounded-lg hover:bg-muted transition-colors">
          {profile ? <MemberAvatar member={profile} size="xs" /> : <User className="size-4 shrink-0" />}
          <span className="text-xs font-medium hidden sm:inline max-w-[120px] truncate">{profile?.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled className="opacity-100">
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{profile?.name}</span>
            <span className="text-xs text-muted-foreground">{profile?.email}</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut} className="gap-2 text-muted-foreground">
          <LogOut className="size-3.5" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const ADMIN_ONLY_PAGES: Page[] = ["settings"]

function AppInner() {
  const { loading, saving, setActiveProjectId, tasks, loadError, reloadTasks } = useApp()
  const { isAdmin } = useAuth()
  const [ministryId, setMinistryId] = useState<string | null>(null)
  const [newProjectMinistry, setNewProjectMinistry] = useState<string | null>(null)
  const navigate = (target: Page) => { setNewProjectMinistry(null); setPage(target); if (target === "ministries") setMinistryId(null) }
  const selectMinistry = (id: string | null) => { setMinistryId(id); setPage("ministries"); setActiveProjectId(null) }
  const [page, setPage] = useState<Page>("dashboard")
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null)
  const detailTask = detailTaskId ? tasks.find(t => t.id === detailTaskId) ?? null : null
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [jarvisOpen, setJarvisOpen] = useState(false)

  const PAGE_LABELS: Record<Page, string> = { dashboard: "Dashboard", tasks: "Tarefas", projects: "Projetos", notes: "Notas", calendar: "Calendário", users: "Usuários", settings: "Configurações", ministries: "Ministérios" }

  // Sai de uma página restrita a admin se a identidade atual deixar de ser admin
  useEffect(() => {
    if (!isAdmin && ADMIN_ONLY_PAGES.includes(page)) setPage("dashboard")
  }, [isAdmin, page])

  // Check for tasks due today
  useEffect(() => {
    const notifiedKey = "lincoln-today-notification"
    const already = sessionStorage.getItem(notifiedKey)
    if (!already && tasks.length > 0) {
      const dueTodayCount = tasks.filter(t => {
        return t.dueDate && isToday(parseISO(t.dueDate)) && t.status !== "done"
      }).length

      if (dueTodayCount > 0) {
        toast.info(`${dueTodayCount} tarefa${dueTodayCount > 1 ? 's' : ''} vence hoje!`)
        sessionStorage.setItem(notifiedKey, "true")
      }
    }
  }, [tasks])

  function triggerSearch() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))
  }

  return (
    <SidebarProvider>
      <AppSidebar page={page} onNavigate={navigate} isAdmin={isAdmin} selectedMinistryId={ministryId} onSelectMinistry={selectMinistry} />
      <SidebarInset>
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-4">
          <SidebarTrigger className="-ml-1" />
          <span className="text-sm font-medium text-muted-foreground flex-1">{PAGE_LABELS[page]}</span>
          <Button variant="ghost" size="sm" className="h-8 gap-2 text-muted-foreground text-xs hidden sm:flex" onClick={triggerSearch}>
            <Search className="size-3.5" />
            <span className="hidden md:inline">Buscar</span>
            <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] hidden md:inline">Ctrl K</kbd>
          </Button>
          {saving && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom">Salvando...</TooltipContent>
            </Tooltip>
          )}
          <Button variant="ghost" size="icon" className="size-8" title="Jarvis" onClick={() => setJarvisOpen(true)}>
            <Bot className="size-4" />
          </Button>
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </header>

        {/* Main — extra bottom padding on mobile for BottomNav */}
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24 md:pb-6">
          {loadError && <div role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-sm">
            {loadError} <Button variant="outline" size="sm" className="ml-2" onClick={() => void reloadTasks()}>Tentar novamente</Button>
          </div>}
          {loading && (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-8 w-48" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
              <Skeleton className="h-40" />
            </div>
          )}
          {!loading && page === "dashboard" && <DashboardPage />}
          {!loading && page === "tasks" && (
            <TasksPage
              onOpenTask={t => setDetailTaskId(t.id)}
              newTaskOpen={newTaskOpen}
              onNewTaskClose={() => setNewTaskOpen(false)}
            />
          )}
          {!loading && page === "projects" && <ProjectsPage initialMinistryId={newProjectMinistry} />}
          {!loading && page === "ministries" && <MinistriesPage ministryId={ministryId} onSelect={selectMinistry} onOpenProject={id => {setActiveProjectId(id); setPage("tasks")}} onOpenTask={t => setDetailTaskId(t.id)} onManagePeople={() => navigate("users")} onNewProject={id => {setNewProjectMinistry(id); setPage("projects")}} />}
          {!loading && page === "notes" && <NotesPage />}
          {!loading && page === "calendar" && <CalendarPage onOpenTask={t => setDetailTaskId(t.id)} />}
          {!loading && page === "users" && <UsersPage />}
          {!loading && page === "settings" && <SettingsPage />}
        </main>
      </SidebarInset>

      {/* Mobile bottom nav */}
      <BottomNav page={page} onNavigate={navigate} onSearch={triggerSearch} />

      {/* Global overlays */}
      <TaskDetailSheet task={detailTask} onClose={() => setDetailTaskId(null)} />
      <CommandPalette
        onNavigate={navigate}
        onOpenTask={task => { setPage("tasks"); setDetailTaskId(task.id) }}
        onNewTask={() => { setPage("tasks"); setNewTaskOpen(true) }}
        setActiveProjectId={setActiveProjectId}
      />
      <ConfirmDialogProvider />
      <JarvisPanel open={jarvisOpen} onClose={() => setJarvisOpen(false)} />
    </SidebarProvider>
  )
}

function AuthGate() {
  const { session, loading, access, accessError, refreshAccess, signOut } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) return <LoginPage />
  if (accessError) return <main className="p-8 space-y-4"><p role="alert">Não foi possível validar seu acesso: {accessError}</p><Button onClick={refreshAccess}>Tentar novamente</Button><Button variant="outline" onClick={signOut}>Sair</Button></main>
  if (!access) return <main className="p-8">Verificando acesso…</main>
  if (!access.ready) return <AccountOnboarding key={`${session.user.id}-${access.passwordRequired}-${access.consented}`} status={access} />

  return (
    <AppProvider key={session.user.id}>
      <AppInner />
    </AppProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <AuthGate />
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </AuthProvider>
  )
}
