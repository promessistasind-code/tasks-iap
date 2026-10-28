import {useState} from 'react'
import {useApp} from '@/context/AppContext'
import {useAuth} from '@/context/AuthContext'
import {Button} from '@/components/ui/button'
import {Textarea} from '@/components/ui/textarea'
import {STATUS_CONFIG, PRIORITY_CONFIG, RECURRING_CONFIG, type Task} from '@/types/task'

export function TaskReadOnly({task}: {task: Task}) {
  const {members, projects, canCommentTask, addComment, deleteComment, saving} = useApp()
  const {session} = useAuth()
  const [text, setText] = useState('')
  return <div className="space-y-5 overflow-y-auto p-6">
    <h2 className="pr-8 text-xl font-semibold">{task.title}</h2>
    <p className="text-sm text-muted-foreground">Você pode acompanhar esta tarefa{canCommentTask(task) ? ' e participar dos comentários' : ''}. Os campos principais são administrados pelo responsável e pela liderança.</p>
    <dl className="space-y-2 text-sm"><div><dt>Status</dt><dd>{STATUS_CONFIG[task.status].label}</dd></div><div><dt>Prioridade</dt><dd>{PRIORITY_CONFIG[task.priority].label}</dd></div><div><dt>Entrega</dt><dd>{task.dueDate ?? 'Sem data'}</dd></div><div><dt>Responsável</dt><dd>{task.assignee ?? 'Sem responsável'}</dd></div><div><dt>Equipe</dt><dd>{(task.teamIds ?? []).map(id => members.find(m => m.id === id)?.name ?? 'Participante').join(', ') || 'Sem participantes'}</dd></div></dl>
    <p className="text-sm">Projeto: {projects.find(p => p.id === task.projectId)?.name} · Recorrência: {task.recurring ? RECURRING_CONFIG[task.recurring] : "Nenhuma"}</p>
    <p className="text-sm">{task.tags.join(", ")}</p>
    <p className="whitespace-pre-wrap text-sm">{task.description}</p>
    <section><h3 className="font-medium">Checklist</h3>{task.checklist.map(item => <p key={item.id} className="text-sm">{item.done ? '✓' : '○'} {item.text}</p>)}</section>
    <section><h3 className="font-medium">Links</h3>{task.links.map(link => <p key={link.id}><a className="text-sm underline" href={/^https?:\/\//i.test(link.url) ? link.url : '#'} target="_blank" rel="noopener noreferrer">{link.title}</a></p>)}</section>
    <section className="space-y-2"><h3 className="font-medium">Comentários</h3>{task.comments.map(comment => <div className="rounded border p-2 text-sm" key={comment.id}><strong>{members.find(m => m.id === comment.authorId)?.name ?? 'Usuário'}</strong><p className="whitespace-pre-wrap">{comment.text}</p>{canCommentTask(task) && comment.authorId === session?.user.id && <Button size="sm" variant="ghost" disabled={saving} onClick={() => deleteComment(task.id,comment.id)}>Excluir meu comentário</Button>}</div>)}
      {canCommentTask(task) && <form className="space-y-2" onSubmit={async e => {e.preventDefault(); if (text.trim() && await addComment(task.id,text.trim())) setText('')}}><Textarea aria-label="Comentário" value={text} onChange={e => setText(e.target.value)} /><Button disabled={saving || !text.trim()} type="submit">Enviar comentário</Button></form>}
    </section>
    <section><h3 className="font-medium">Histórico</h3>{task.activity.map(entry => <p key={entry.id} className="text-sm">{entry.text}</p>)}</section>
  </div>
}
