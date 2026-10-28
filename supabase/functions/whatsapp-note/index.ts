/**
 * Edge Function: whatsapp-note
 *
 * Recebe webhooks da Evolution API e cria notas no Lincoln General System.
 *
 * SETUP:
 * 1. Instale a Evolution API: https://doc.evolution-api.com/
 *    - Docker: docker run -d --name evolution-api -p 8080:8080 atendai/evolution-api:latest
 *    - Railway: deploy direto do GitHub
 *
 * 2. No painel da Evolution API, configure:
 *    - Crie uma instância e conecte seu WhatsApp via QR Code
 *    - Em "Webhooks", adicione a URL desta função:
 *      https://bplpowejgqukfsqxfhoj.supabase.co/functions/v1/whatsapp-note
 *    - Eventos: MESSAGES_UPSERT
 *
 * 3. Deploy desta função:
 *    supabase functions deploy whatsapp-note --project-ref bplpowejgqukfsqxfhoj
 *
 * 4. Variáveis de ambiente necessárias (supabase secrets set):
 *    supabase secrets set SUPABASE_URL=https://bplpowejgqukfsqxfhoj.supabase.co
 *    supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<sua service role key>
 *    supabase secrets set WHATSAPP_ALLOWED_NUMBER=55XXXXXXXXXXX (seu número, só dígitos)
 *    supabase secrets set WEBHOOK_SECRET=<qualquer string secreta>
 *
 * USO NO WHATSAPP:
 * Mande mensagem para o número conectado com:
 *   /nota Título da nota
 *   Conteúdo da nota aqui...
 *
 *   /nota Ideia do produto
 *   - Funcionalidade A
 *   - Funcionalidade B
 *
 *   /nota #reuniao #equipe Pauta 05/06
 *   1. Alinhamento de metas
 *   2. Review do sprint
 *   (tags começam com #, são extraídas automaticamente)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ALLOWED_NUMBER = Deno.env.get("WHATSAPP_ALLOWED_NUMBER") // ex: "5511999999999"
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")
// Explicit server-side binding; never accept a note owner from a webhook body.
const NOTE_OWNER_ID = Deno.env.get("WHATSAPP_NOTE_OWNER_ID")

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

Deno.serve(async (req) => {
  // Verificar método
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  if (!WEBHOOK_SECRET || !ALLOWED_NUMBER || !NOTE_OWNER_ID) {
    return new Response("Integration not configured", { status: 503 })
  }
  // A privileged webhook requires authentication and an explicit private owner.
  if (WEBHOOK_SECRET) {
    const secret = req.headers.get("x-webhook-secret") || req.headers.get("apikey")
    if (secret !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 })
    }
  }

  try {
    const body = await req.json()

    // Estrutura do webhook da Evolution API
    const event = body.event || body.type
    const data = body.data || body

    // Só processar mensagens recebidas
    if (event !== "MESSAGES_UPSERT" && event !== "messages.upsert") {
      return new Response("Ignored", { status: 200 })
    }

    const messages = Array.isArray(data) ? data : [data]

    for (const message of messages) {
      // Só mensagens de texto recebidas (não enviadas pelo bot)
      const msg = message.message || message
      const fromMe = msg.key?.fromMe || message.fromMe
      if (fromMe) continue

      const text = msg.message?.conversation ||
                   msg.message?.extendedTextMessage?.text ||
                   message.body ||
                   ""

      const senderNumber = (msg.key?.remoteJid || message.from || "")
        .replace("@s.whatsapp.net", "")
        .replace("@g.us", "")

      // Verificar se é o número autorizado
      if (senderNumber !== ALLOWED_NUMBER.replace(/\D/g, "")) {
        continue
      }

      // Verificar se começa com /nota
      if (!text.trim().toLowerCase().startsWith("/nota")) {
        continue
      }

      // Parsear o comando
      const body_text = text.replace(/^\/nota\s*/i, "").trim()
      const lines = body_text.split("\n")

      // Primeira linha = título (sem as tags)
      let firstLine = lines[0] || ""

      // Extrair tags (#hashtag) da primeira linha
      const tagMatches = firstLine.match(/#[\wÀ-ž]+/g) || []
      const tags = tagMatches.map(t => t.slice(1).toLowerCase())
      firstLine = firstLine.replace(/#[\wÀ-ž]+/g, "").trim()

      const title = firstLine || `WhatsApp - ${new Date().toLocaleDateString("pt-BR")}`
      const content = lines.slice(1).join("\n").trim()

      // Inserir nota no banco
      const { error } = await supabase.from("lt_notes").insert({
        user_id: NOTE_OWNER_ID,
        title,
        content,
        tags,
        color: "green", // notas do WhatsApp ficam verdes para diferenciar
        pinned: false,
      })

      if (error) {
        console.error("Erro ao inserir nota:", error)
        return new Response("Database error", { status: 500 })
      }

      console.log("Nota privada criada")
    }

    return new Response("OK", { status: 200 })
  } catch (err) {
    console.error("Erro:", err)
    return new Response("Internal error", { status: 500 })
  }
})
