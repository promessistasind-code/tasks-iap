import { supabase } from "./supabase"

export const CONSENT_NOTICE =
  "Seu nome e sobrenome ficarão visíveis aos usuários do sistema. O dia e mês do seu aniversário aparecerão no calendário geral, sem o ano de nascimento. Email e telefone serão visíveis aos administradores e aos líderes dos ministérios aos quais você pertence. A data de nascimento completa ficará disponível apenas para você e os administradores."
export interface AccountStatus {
  ready: boolean
  passwordRequired: boolean
  resetInProgress: boolean
  consented: boolean
  firstName: string
  lastName: string
  phone: string
  birthDate: string | null
  email: string
  isAdmin: boolean
  isGeneralAdmin: boolean
  isLeader: boolean
}
export interface Ministry {
  id: string
  name: string
  functions: { id: string; name: string }[]
}
export interface Membership {
  person_id: string
  ministry_id: string
  function_ids: string[]
  leader: boolean
  can_add: boolean
  can_edit_roles: boolean
  can_remove: boolean
  can_create_projects?: boolean
  can_create_tasks?: boolean
  active: boolean
  added_by: string
}
export interface Person {
  id: string
  userId: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  birthDate?: string | null
  birthdayMonth?: number
  birthdayDay?: number
  consented?: boolean
  isAdmin?: boolean
  active?: boolean
  memberships?: Membership[]
}
export async function peopleApi<T>(
  op: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.rpc("people_portal", { op, payload })
  if (error) throw new Error(error.message)
  return data as T
}
export function membershipPayload(m: Membership) {
  return {
    personId: m.person_id,
    ministryId: m.ministry_id,
    functionIds: m.function_ids,
    leader: m.leader,
    canAdd: m.can_add,
    canEditRoles: m.can_edit_roles,
    canRemove: m.can_remove,
    canCreateProjects: !!m.can_create_projects,
    canCreateTasks: !!m.can_create_tasks,
    active: m.active,
  }
}
