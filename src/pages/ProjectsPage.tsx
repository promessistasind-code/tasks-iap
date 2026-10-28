import { useState, useEffect } from "react"
import { useApp } from "@/context/AppContext"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import type { Project } from "@/types/task"
import { PROJECT_COLORS } from "@/types/task"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ProjectIcon, PROJECT_ICONS } from "@/components/ProjectIcon"
import { MemberAvatar } from "@/components/MemberAvatar"
import { showConfirm } from "@/components/ConfirmDialog"
import { Plus, Pencil, Trash2, CheckCircle2, Clock, Users, Check, Clock3, Paperclip, Ban, PlayCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ProjectFilesDialog } from "@/components/ProjectFilesDialog"

const emptyForm = { name: "", emoji: "target", color: PROJECT_COLORS[0], ministryId: "" }

export function ProjectsPage() {
  const { creatableMinistries, projects, tasks, members, addProject, updateProject, deleteProject, sendProjectInvite, cancelInvite } = useApp()
  const { isAdmin, session } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [inviteProject, setInviteProject] = useState<Project | null>(null)
  const [filesProject, setFilesProject] = useState<Project | null>(null)
  const [projectMemberIds, setProjectMemberIds] = useState<string[]>([])
  const [pendingInviteIds, setPendingInviteIds] = useState<string[]>([])

  async function loadInviteState(projectId: string) {
    const [{ data: memberRows }, { data: pendingRows }] = await Promise.all([
      supabase.from("lt_project_members").select("user_id").eq("project_id", projectId),
      supabase.from("lt_notifications").select("recipient_id")
        .eq("project_id", projectId).eq("type", "project_invite").eq("status", "pending"),
    ])
    setProjectMemberIds((memberRows ?? []).map(r => r.user_id as string))
    setPendingInviteIds((pendingRows ?? []).map(r => r.recipient_id as string))
  }

  useEffect(() => {
    if (!inviteProject) return
    loadInviteState(inviteProject.id)
  }, [inviteProject])

  async function toggleProjectMember(userId: string) {
    if (!inviteProject) return
    if (projectMemberIds.includes(userId)) return // remoção de acesso fica só pra admin/dono, fora deste fluxo
    if (pendingInviteIds.includes(userId)) {
      const ok = await cancelInvite(userId, inviteProject.id)
      if (ok) setPendingInviteIds(prev => prev.filter(id => id !== userId))
      return
    }
    const ok = await sendProjectInvite(userId, inviteProject.id)
    if (ok) {
      setPendingInviteIds(prev => [...prev, userId])
      toast.success("Convite enviado!")
    }
  }

  function openNew() {
    setEditingProject(null)
    setForm({...emptyForm, ministryId: creatableMinistries[0]?.id ?? ""})
    setDialogOpen(true)
  }

  function openEdit(project: Project) {
    setEditingProject(project)
    setForm({ name: project.name, emoji: project.emoji, color: project.color, ministryId: project.ministryId ?? "" })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    if (editingProject) {
      const ok = await updateProject(editingProject.id, form)
      if (!ok) return
      toast.success("Projeto atualizado")
    } else {
      const project = await addProject(form)
      if (!project) return
      toast.success("Projeto criado!")
    }
    setDialogOpen(false)
  }

  async function handleDelete(project: Project) {
    const count = tasks.filter(t => t.projectId === project.id).length
    const ok = await showConfirm({
      title: `Excluir "${project.name}"?`,
      description: count > 0
        ? `Isso também excluirá ${count} tarefa${count > 1 ? "s" : ""} vinculada${count > 1 ? "s" : ""} a este projeto.`
        : "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    })
    if (ok) {
      const deleted = await deleteProject(project.id)
      if (deleted) toast.success("Projeto excluído")
    }
  }

  async function handleToggleSuspend(project: Project) {
    const suspending = !project.suspended
    if (suspending) {
      const ok = await showConfirm({
        title: `Suspender "${project.name}"?`,
        description: "Ninguém (exceto admins) vai conseguir criar, editar ou excluir tarefas neste projeto até ele ser reativado.",
        confirmLabel: "Suspender",
        variant: "destructive",
      })
      if (!ok) return
    }
    const done = await updateProject(project.id, { suspended: suspending })
    if (done) toast.success(suspending ? "Projeto suspenso" : "Projeto reativado")
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Projetos</h1>
            <p className="text-muted-foreground text-sm">Gerencie os projetos dos ministérios</p>
          </div>
          <Button onClick={openNew} disabled={!creatableMinistries.length}>
            <Plus className="size-4" data-icon="inline-start" />
            Novo projeto
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => {
            const projectTasks = tasks.filter(t => t.projectId === project.id)
            const done = projectTasks.filter(t => t.status === "done").length
            const active = projectTasks.filter(t => t.status !== "done").length
            const pct = projectTasks.length > 0 ? Math.round((done / projectTasks.length) * 100) : 0

            return (
              <Card key={project.id} className={cn("group hover:shadow-md transition-shadow", project.suspended && "opacity-60")}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-10 rounded-xl flex items-center justify-center"
                        style={{ background: project.color + "22", border: `1px solid ${project.color}44` }}
                      >
                        <ProjectIcon iconKey={project.emoji} size={20} style={{ color: project.color }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CardTitle className="text-base">{project.name}</CardTitle>
                          {project.suspended && <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">Suspenso</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {projectTasks.length} tarefa{projectTasks.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="size-7" disabled={!project.canManage} title="Convidar" onClick={() => setInviteProject(project)}>
                        <Users className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" title="Arquivos" onClick={() => setFilesProject(project)}>
                        <Paperclip className="size-3.5" />
                      </Button>
                      {project.canManage && (
                        <Button
                          variant="ghost" size="icon" className="size-7"
                          title={project.suspended ? "Reativar projeto" : "Suspender projeto"}
                          onClick={() => handleToggleSuspend(project)}
                        >
                          {project.suspended ? <PlayCircle className="size-3.5" /> : <Ban className="size-3.5" />}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="size-7" disabled={!project.canManage} onClick={() => openEdit(project)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 hover:text-destructive"
                        disabled={!isAdmin && project.createdBy !== session?.user.id} onClick={() => handleDelete(project)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: project.color }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      <span>{active} ativas</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle2 className="size-3" />
                      <span>{done} concluídas</span>
                    </div>
                  </div>

                </CardContent>
              </Card>
            )
          })}

          <button
            onClick={openNew} disabled={!creatableMinistries.length}
            className="rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30 transition-all flex flex-col items-center justify-center gap-2 p-6 min-h-[160px] text-muted-foreground hover:text-foreground"
          >
            <div className="size-10 rounded-xl bg-muted flex items-center justify-center">
              <Plus className="size-5" />
            </div>
            <span className="text-sm font-medium">Novo projeto</span>
          </button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingProject ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-y-auto -mx-6 px-6">
          <div className="flex flex-col gap-4 pb-2">
            <label className="text-sm">Ministério
              <select aria-label="Ministério do projeto" className="mt-1 w-full rounded border bg-background p-2" value={form.ministryId} disabled={!!editingProject && !isAdmin} onChange={e => setForm(f => ({...f, ministryId: e.target.value}))}>
                <option value="">Selecione o ministério</option>
                {creatableMinistries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            {/* Preview */}
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <div
                className="size-12 rounded-xl flex items-center justify-center"
                style={{ background: form.color + "22", border: `1px solid ${form.color}44` }}
              >
                <ProjectIcon iconKey={form.emoji} size={24} style={{ color: form.color }} />
              </div>
              <div>
                <p className="font-semibold">{form.name || "Nome do projeto"}</p>
                <p className="text-xs text-muted-foreground">Prévia</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Nome *</label>
              <Input
                placeholder="Nome do projeto"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Ícone</label>
              <div className="grid grid-cols-5 gap-1.5">
                {PROJECT_ICONS.map(({ key, Icon, label }) => (
                  <button
                    key={key}
                    title={label}
                    onClick={() => setForm(f => ({ ...f, emoji: key }))}
                    className={cn(
                      "size-10 rounded-lg flex items-center justify-center hover:bg-muted transition-colors",
                      form.emoji === key
                        ? "ring-2 ring-offset-1 ring-primary bg-muted"
                        : "text-muted-foreground"
                    )}
                    style={form.emoji === key ? { color: form.color } : {}}
                  >
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">Cor</label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setForm(f => ({ ...f, color }))}
                    className={cn(
                      "size-8 rounded-full transition-transform hover:scale-110",
                      form.color === color && "ring-2 ring-offset-2 ring-primary scale-110"
                    )}
                    style={{ background: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 pt-2 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || (!editingProject && !form.ministryId)}>
              {editingProject ? "Salvar" : "Criar projeto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!inviteProject} onOpenChange={v => !v && setInviteProject(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convidar pra "{inviteProject?.name}"</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {members.map(m => {
              const has = projectMemberIds.includes(m.id)
              const isPending = pendingInviteIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggleProjectMember(m.id)}
                  disabled={has}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <MemberAvatar member={m} size="xs" />
                  <span className="flex-1 text-sm">{m.name}</span>
                  {has && <Check className="size-4 text-primary" />}
                  {!has && isPending && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock3 className="size-3" /> Convite enviado
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">Clique pra convidar — a pessoa só passa a ver as tarefas depois de aceitar a notificação.</p>
        </DialogContent>
      </Dialog>

      <ProjectFilesDialog project={filesProject} onClose={() => setFilesProject(null)} />
    </>
  )
}
