import { supabase } from "./supabase"
export async function schedulingApi<T>(
  op: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.rpc("scheduling_portal", {
    op,
    payload,
  })
  if (error)
    throw new Error(
      error.code === "23505"
        ? "Já existe uma solicitação pendente para esta atribuição."
        : error.message
    )
  return data as T
}
export const deviceTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone
export interface ScheduleState {
  conflicts: string[]
  swaps: {
    id: string
    assignmentId: string
    personName: string
    replacementName: string
    status: "pending" | "approved" | "rejected" | "cancelled"
    canDecide: boolean
    canCancel: boolean
  }[]
}
