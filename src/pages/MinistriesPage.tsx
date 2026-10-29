import {MinistryEvents} from '@/components/MinistryEvents'
import {useState} from 'react'
import {useApp} from '@/context/AppContext'
import {useAuth} from '@/context/AuthContext'
import {Button} from '@/components/ui/button'
import {TaskDialog} from '@/components/TaskDialog'
import {ProjectIcon} from '@/components/ProjectIcon'
import {STATUS_CONFIG, type Task} from '@/types/task'
import {ArrowLeft, FolderKanban, Users, Plus} from 'lucide-react'

interface Props {
  ministryId: string | null
  onSelect: (id: string | null) => void
  onOpenProject: (id: string) => void
  onOpenTask: (task: Task) => void
  onManagePeople: () => void
  onNewProject: (ministryId: string) => void
}

export function MinistriesPage({ministryId,onSelect,onOpenProject,onOpenTask,onManagePeople,onNewProject}: Props) {
  const {ministries, ministryCatalog, ministriesLoading, ministriesError, reloadMinistries, projects, tasks, creatableMinistries} = useApp()
  const {isAdmin} = useAuth()
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null)
  if (ministriesLoading) return <p role="status">Carregando ministérios…</p>
  if (ministriesError) return <div role="alert" className="space-y-3"><p>{ministriesError}</p><Button onClick={reloadMinistries}>Tentar novamente</Button></div>
  const ministry = ministries.find(m => m.id === ministryId)
  if (ministryId && !ministry) return <div className="space-y-3"><p>Este ministério não está disponível para sua conta.</p><Button onClick={() => onSelect(null)}>Ver meus ministérios</Button></div>
  if (!ministry) return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Ministérios</h1><p className="text-sm text-muted-foreground">{isAdmin ? 'Acompanhe os espaços de trabalho dos ministérios.' : 'Conheça todos os ministérios e acesse aqueles dos quais você faz parte.'}</p></div>
    {!ministries.length && <p className="rounded-xl border p-6 text-sm text-muted-foreground">Você ainda não tem um vínculo ativo com um ministério. O administrador ou um líder autorizado pode adicioná-lo.</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{ministryCatalog.map(m => {
      const canAccess = isAdmin || !!m.membership
      const count = projects.filter(p => p.ministryId === m.id).length
      return <button key={m.id} disabled={!canAccess} className="rounded-xl border bg-card p-5 text-left transition-colors enabled:hover:border-primary disabled:cursor-not-allowed disabled:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary" onClick={() => {if (canAccess) onSelect(m.id)}}>
        <Users className="mb-3 size-6 text-primary"/><h2 className="font-semibold">{m.name}</h2><p className="mt-2 text-sm text-muted-foreground">{canAccess ? <>{m.membership?.leader ? 'Liderança' : m.membership ? 'Membro' : 'Acesso administrativo'} · {count} projeto{count === 1 ? '' : 's'}</> : 'Acesso exclusivo aos integrantes'}</p>
      </button>
    })}</div>
  </div>
  const scopedProjects = projects.filter(p => p.ministryId === ministry.id)
  const projectIds = new Set(scopedProjects.map(p => p.id))
  const scopedTasks = tasks.filter(t => projectIds.has(t.projectId))
  const functions = ministry.functions.filter(f => ministry.membership?.function_ids.includes(f.id))
  const canCreateProject = creatableMinistries.some(m => m.id === ministry.id)
  return <div className="space-y-6">
    <Button variant="ghost" onClick={() => onSelect(null)}><ArrowLeft className="size-4"/>Todos os ministérios</Button>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">{ministry.name}</h1><p className="mt-1 text-sm text-muted-foreground">{ministry.membership?.leader ? 'Você é líder deste ministério.' : isAdmin ? 'Você tem acesso administrativo.' : 'Seu espaço de participação.'}</p>{functions.length > 0 && <p className="mt-2 text-sm">Suas funções: {functions.map(f => f.name).join(', ')}</p>}</div>
      <div className="flex flex-wrap gap-2">{(isAdmin || ministry.membership?.leader) && <Button variant="outline" onClick={onManagePeople}>Pessoas e permissões</Button>}{canCreateProject && <Button onClick={() => onNewProject(ministry.id)}><Plus className="size-4"/>Novo projeto neste ministério</Button>}</div>
    </div>
    <div className="grid grid-cols-3 gap-3">{[['Projetos',scopedProjects.length],['Tarefas ativas',scopedTasks.filter(t => t.status !== 'done').length],['Concluídas',scopedTasks.filter(t => t.status === 'done').length]].map(([label,count]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></div>)}</div>
    <MinistryEvents key={ministry.id} ministryId={ministry.id}/>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Projetos do ministério</h2>{!scopedProjects.length && <p className="text-sm text-muted-foreground">Nenhum projeto vinculado a este ministério.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{scopedProjects.map(p => <article key={p.id} className="rounded-xl border p-4"><div className="flex items-center gap-2"><ProjectIcon iconKey={p.emoji} className="size-5" style={{color:p.color}}/><h3 className="font-medium">{p.name}</h3>{p.suspended && <span className="text-xs text-muted-foreground">Suspenso</span>}</div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onOpenProject(p.id)}><FolderKanban className="size-4"/>Abrir tarefas</Button>{p.canCreateTasks && <Button size="sm" onClick={() => setTaskProjectId(p.id)}>Criar tarefa</Button>}</div></article>)}</div>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Tarefas do ministério</h2>{!scopedTasks.length && <p className="text-sm text-muted-foreground">Nenhuma tarefa por aqui ainda.</p>}<div className="divide-y rounded-xl border">{scopedTasks.map(t => <button key={t.id} className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left hover:bg-muted/50" onClick={() => onOpenTask(t)}><span className="min-w-0 flex-1 break-words font-medium">{t.title}</span><span className="text-xs text-muted-foreground">{t.assignee ?? 'Sem responsável'} · {STATUS_CONFIG[t.status].label}</span></button>)}</div></section>
    {taskProjectId && projectIds.has(taskProjectId) && <TaskDialog open onClose={() => setTaskProjectId(null)} projectScopeId={taskProjectId}/>}
  </div>
}
