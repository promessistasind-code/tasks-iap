import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/async'
import type { Task, Project } from '@/types/task'
import { mapProject } from './mappers'
import { upsertById } from './state'

interface Options {
  setSaving: (value: boolean) => void
  setProjects: Dispatch<SetStateAction<Project[]>>
  setTasks: Dispatch<SetStateAction<Task[]>>
}

export function useProjectActions({setSaving,setProjects,setTasks}: Options) {
  async function addProject(projectData: Omit<Project, "id" | "createdBy" | "suspended">) {
    try {
      setSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await withTimeout(supabase.from("lt_projects").insert({
        name: projectData.name, color: projectData.color, emoji: projectData.emoji,
        created_by: user?.id ?? null,
        ministry_id: projectData.ministryId || null,
      }).select().single())
      if (error || !data) {
        toast.error("Erro ao criar projeto")
        return
      }
      // The database enrolls the owner atomically.
      const p = mapProject(data)
      setProjects(prev => upsertById(prev, p))
      return p
    } catch {
      toast.error("Demorou demais pra criar o projeto — tenta de novo")
      return undefined
    } finally {
      setSaving(false)
    }
  }

  async function updateProject(id: string, patch: Partial<Project>): Promise<boolean> {
    try {
      setSaving(true)
      const dbPatch: Record<string, unknown> = {}
      if (patch.name !== undefined) dbPatch.name = patch.name
      if (patch.color !== undefined) dbPatch.color = patch.color
      if (patch.emoji !== undefined) dbPatch.emoji = patch.emoji
      if (patch.suspended !== undefined) dbPatch.suspended = patch.suspended
      if (patch.ministryId !== undefined) dbPatch.ministry_id = patch.ministryId || null
      const { error } = await withTimeout(supabase.from("lt_projects").update(dbPatch).eq("id", id).select("id").single())
      if (error) {
        toast.error(patch.suspended !== undefined ? "Só administradores podem suspender/reativar um projeto" : "Erro ao atualizar projeto")
        return false
      }
      setProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
      return true
    } catch {
      toast.error("Demorou demais pra atualizar o projeto — tenta de novo")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function deleteProject(id: string): Promise<boolean> {
    try {
      setSaving(true)
      const { error } = await withTimeout(supabase.from("lt_projects").delete().eq("id", id).select("id").single())
      if (error) {
        toast.error("Erro ao excluir projeto")
        return false
      }
      setProjects(prev => prev.filter(p => p.id !== id))
      setTasks(prev => prev.filter(t => t.projectId !== id))
      return true
    } catch {
      toast.error("Demorou demais pra excluir — tenta de novo")
      return false
    } finally {
      setSaving(false)
    }
  }


  return { addProject, updateProject, deleteProject }
}
