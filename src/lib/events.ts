import { supabase } from "./supabase"
export interface MinistryOption {
  id: string
  name: string
}
export interface ChurchEvent {
  id: string
  ministryName?: string
  ministry_id: string
  title: string
  description: string
  location: string
  starts_at: string
  ends_at: string
  shared_with: string[]
  cancelled: boolean
  version: number
  canManage: boolean
  canPastorSchedule?: boolean
  isAssigned?: boolean
  series_id?: string | null
}
export interface Assignment {
  id: string
  ministryId: string
  personId: string
  name: string
  functionId: string
  functionName: string
  response: "pending" | "confirmed" | "declined"
  canManage: boolean
  canPastorManage?: boolean
  canRespond: boolean
}
export interface EventDetail {
  event: ChurchEvent
  assignments: Assignment[]
  scheduleMinistries: MinistryOption[]
}
export interface EventFeed {
  items: ChurchEvent[]
  creatableMinistries: MinistryOption[]
}
export async function eventApi<T>(
  op: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.rpc("event_portal", { op, payload })
  if (error) {
    const messages: Record<string, string> = {
      "Pessoa indisponível ou escalada em outro evento neste horário.":
        "Pessoa indisponível ou escalada em outro evento neste horário.",
      "Event changed; reload before saving":
        "Este evento foi alterado. Feche e abra novamente antes de salvar.",
      "Event unavailable":
        "Evento indisponível, cancelado ou sem permissão de acesso.",
      "Owner ministry leader required":
        "Somente a liderança do ministério responsável pode editar este evento.",
      "Own shared ministry required":
        "Você pode organizar apenas a escala do seu ministério participante.",
      "Sharing was revoked":
        "O compartilhamento com este ministério foi encerrado.",
      "Only the assigned person can respond":
        "Somente a pessoa escalada pode responder por sua participação.",
      "Active member with this function required":
        "Selecione um integrante ativo com esta função e cadastro autorizado.",
    }
    throw new Error(
      messages[error.message] ??
        "Não foi possível concluir. Confira os dados e tente novamente."
    )
  }
  return data as T
}
