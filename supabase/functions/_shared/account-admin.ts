import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2"
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" }
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
export function accountAdmin(action: "create" | "reset") {
 return async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers })
  if (req.method !== "POST") return respond({ error: "Método não permitido" }, 405)
  try {
   const url = Deno.env.get("SUPABASE_URL")!, secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
   const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
   const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
   const { data: { user }, error: authError } = await admin.auth.getUser(token)
   if (authError || !user) return respond({ error: "Não autenticado" }, 401)
   const caller = createClient(url, secret, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
   const { data: status, error: accessError } = await caller.rpc("people_portal", { op: "status" })
   if (accessError || !status?.ready || !status?.isAdmin) return respond({ error: "Acesso administrativo necessário" }, 403)
   const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
   const body = await req.json(), password = action === "create" ? body.password : body.newPassword
   if (typeof password !== "string" || password.length < 12 || password.length > 128) return respond({ error: "Use uma senha temporária de 12 a 128 caracteres" }, 400)
   const service = async (op: string, payload: Record<string, unknown>) => {
    const { data, error } = await admin.rpc("people_account_service", { actor: user.id, op, payload: { ...payload, actorSessionId: claims.session_id } })
    if (error) throw new Error(error.message)
    return data
   }
   if (action === "reset") {
    if (typeof body.userId !== "string") return respond({ error: "Usuário inválido" }, 400)
    const started = await service("resetStart", { userId: body.userId })
    const { error } = await admin.auth.admin.updateUserById(body.userId, { password })
    if (error) return respond({ error: "Falha na redefinição. A conta permanece bloqueada. Aguarde cinco minutos antes de tentar novamente." }, 500)
    await service("resetFinish", { userId: body.userId, resetToken: started.resetToken })
    return respond({ ok: true })
   }
   const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond({ error: "Email inválido" }, 400)
   const invite = body.invitation === true
   const firstName = typeof body.firstName === "string" ? body.firstName.trim() : ""
   const lastName = typeof body.lastName === "string" ? body.lastName.trim() : ""
   const phone = typeof body.phone === "string" ? body.phone.trim() : ""
   const birthDate = typeof body.birthDate === "string" ? body.birthDate : null
   if (!invite && (!firstName || !lastName || !phone || !birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || birthDate > new Date().toISOString().slice(0,10))) return respond({ error: "Preencha todos os campos do cadastro" }, 400)
   const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
   if (error || !created.user) return respond({ error: "Não foi possível criar o convite. Verifique se o email já possui conta." }, 400)
   try {
    await service("provision", { userId: created.user.id, email, firstName, lastName, phone, birthDate: invite ? null : birthDate, consent: !invite && body.consent === true })
   } catch {
    await admin.auth.admin.deleteUser(created.user.id)
    return respond({ error: "Não foi possível concluir o cadastro. Tente novamente." }, 500)
   }
   return respond({ ok: true })
  } catch { return respond({ error: "Operação não concluída. Verifique sua permissão e tente novamente." }, 400) }
 }
}
