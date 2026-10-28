import { useApp } from "@/context/AppContext"
import { Button } from "@/components/ui/button"
import type { Task } from "@/types/task"

export function TaskPeoplePicker({ task, disabled = false }: { task: Task; disabled?: boolean }) {
 const { members, projects, updateTask, saving } = useApp()
 const project = projects.find(p => p.id === task.projectId)
 const eligible = members.filter(m => project?.eligibleMemberIds?.includes(m.id))
 return <section className="space-y-2 rounded border p-3 text-sm">
  <label className="block font-medium">Responsável
   <select aria-label="Responsável" disabled={disabled || saving} className="mt-1 block w-full rounded border bg-background p-2" value={task.assigneeId ?? ''} onChange={e => {
    const member = eligible.find(m => m.id === e.target.value)
    void updateTask(task.id, { assigneeId: member?.id ?? null, assignee: member?.name ?? null }, 'Responsável alterado')
   }}><option value="">Sem responsável</option>{eligible.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
   {task.assigneeId && !eligible.some(m => m.id === task.assigneeId) && <option value={task.assigneeId}>{task.assignee ?? 'Responsável indisponível'}</option>}
   </select>
  </label>
  <p className="font-medium">Equipe</p>
  <p className="text-xs text-muted-foreground">Participantes acompanham a tarefa e comentam. A participação não permite alterar os campos principais.</p>
  {eligible.map(m => <label key={m.id} className="flex items-center gap-2"><input type="checkbox" disabled={disabled || saving} checked={task.teamIds?.includes(m.id) ?? false} onChange={e => void updateTask(task.id, { teamIds: e.target.checked ? [...(task.teamIds ?? []), m.id] : (task.teamIds ?? []).filter(id => id !== m.id) }, 'Equipe alterada')} />{m.name}</label>)}
  {(task.teamIds ?? []).filter(id => !eligible.some(m => m.id === id)).map(id => <div key={id} className="flex items-center justify-between"><span>{members.find(m => m.id === id)?.name ?? 'Participante sem acesso atual'}</span><Button disabled={disabled || saving} variant="ghost" size="sm" onClick={() => void updateTask(task.id, { teamIds: task.teamIds?.filter(memberId => memberId !== id) }, 'Participante removido da equipe')}>Remover</Button></div>)}
 </section>
}
