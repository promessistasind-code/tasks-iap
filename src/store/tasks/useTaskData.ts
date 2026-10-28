import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Task, Project } from '@/types/task'
import { mapProject, mapTask, mapComment, mapChecklist, mapActivity, mapTaskLink } from './mappers'

export function useTaskData() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const reloadRef = useRef<() => void>(() => {})
  const reload = useCallback(async () => { reloadRef.current() }, [])

  useEffect(() => {
    let active = true
    let running = false
    let dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    async function load() {
      if (!active) return
      if (running) { dirty = true; return }
      running = true
      try {
        // Embed only children of visible tasks; two requests instead of six scans.
        const [projectResult, taskResult] = await Promise.all([
          supabase.from('lt_projects').select('*').order('created_at').abortSignal(controller.signal),
          supabase.from('lt_tasks').select('*,lt_task_comments(*),lt_task_checklist(*),lt_task_activity(*),lt_task_links(*)')
            .order('position').order('created_at', { ascending: false }).abortSignal(controller.signal),
        ])
        if (projectResult.error) throw projectResult.error
        if (taskResult.error) throw taskResult.error
        if (!active) return
        setLoadError(null)
        setProjects((projectResult.data ?? []).map(mapProject))
        setTasks((taskResult.data ?? []).map(row => mapTask(row,
          [...row.lt_task_comments].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(mapComment),
          [...row.lt_task_checklist].sort((a,b) => a.position-b.position || a.created_at.localeCompare(b.created_at)).map(mapChecklist),
          [...row.lt_task_activity].sort((a,b) => a.created_at.localeCompare(b.created_at)).map(mapActivity),
          row.lt_task_links.map(mapTaskLink))))
      } catch {
        if (active) {
          const message = 'Não foi possível carregar tarefas e projetos. Os últimos dados foram mantidos.'
          setLoadError(message)
          toast.error(message)
        }
      } finally {
        running = false
        if (active) {
          setLoading(false)
          if (dirty) { dirty = false; schedule() }
        }
      }
    }
    function schedule() {
      clearTimeout(timer)
      if (running) { dirty = true; return }
      timer = setTimeout(() => { void load() }, 150)
    }
    reloadRef.current = schedule
    // Subscribe before loading to avoid a gap between snapshot and live events.
    let channel = supabase.channel(`task-data-${crypto.randomUUID()}`)
    for (const table of ['lt_tasks','lt_projects','lt_project_members','lt_task_comments','lt_task_checklist','lt_task_activity','lt_task_links']) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, schedule)
    }
    channel.subscribe(status => { if (status === 'SUBSCRIBED') schedule() })
    window.addEventListener('project-access-changed', schedule)
    window.addEventListener('focus', schedule)
    void load()
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
      reloadRef.current = () => {}
      window.removeEventListener('project-access-changed', schedule)
      window.removeEventListener('focus', schedule)
      void supabase.removeChannel(channel)
    }
  }, [])
  return { tasks, setTasks, projects, setProjects, loading, loadError, reload }
}
