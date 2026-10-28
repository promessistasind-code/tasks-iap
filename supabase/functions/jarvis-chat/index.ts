/**
 * Edge Function: jarvis-chat
 *
 * Cérebro do assistente de voz "Jarvis" (Camada A). Recebe texto e/ou áudio
 * (o Gemini entende áudio nativamente, sem etapa separada de transcrição),
 * junto com o histórico da conversa e a lista de projetos, e responde em
 * texto — usando function calling pra de fato criar tarefas (create_task)
 * ou procurar tarefas existentes (search_tasks) quando for o caso.
 *
 * SETUP:
 * 1. Requer GEMINI_API_KEY configurada no ambiente da função.
 * 2. Deploy: supabase functions deploy jarvis-chat --project-ref hjaqbyxjjpodiqinksbk
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const GEMINI_MODEL = "gemini-2.5-flash"

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const TOOLS = [
  {
    name: "create_task",
    description: "Cria uma nova tarefa real no app.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título curto e acionável da tarefa" },
        description: { type: "string", description: "Descrição/contexto opcional" },
        projectId: { type: "string", description: "ID do projeto onde a tarefa deve entrar, escolhido dentre os projetos informados. Se não for óbvio, pergunte ao usuário antes de chamar esta function." },
      },
      required: ["title", "projectId"],
    },
  },
  {
    name: "search_tasks",
    description: "Procura tarefas existentes pelo título, pra responder perguntas do tipo 'o que eu tenho pendente sobre X'.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca" },
      },
      required: ["query"],
    },
  },
]

interface ChatMessage { role: "user" | "model"; text: string }

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  try {
    const { messages, audioBase64, audioMimeType, projects } = await req.json() as {
      messages: ChatMessage[]
      audioBase64?: string
      audioMimeType?: string
      projects: { id: string; name: string }[]
    }

    const projectList = projects.map(p => `- ${p.name} (id: ${p.id})`).join("\n")

    const systemInstruction = {
      parts: [{
        text: `Você é o Jarvis, assistente pessoal por voz/texto de um app de gestão de tarefas. Responda sempre em português, curto e direto — suas respostas podem ser lidas em voz alta. Ajude o usuário a criar tarefas e consultar o que já existe.

Projetos existentes do usuário:
${projectList || "(nenhum projeto cadastrado)"}

Quando o usuário pedir pra adicionar algo, decida o projeto mais provável pela conversa; se não estiver claro, pergunte antes de chamar create_task. Use search_tasks quando ele perguntar sobre tarefas existentes.`,
      }],
    }

    const historyContents = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }],
    }))

    const currentParts: Record<string, unknown>[] = []
    if (audioBase64) {
      currentParts.push({ inlineData: { mimeType: audioMimeType || "audio/webm", data: audioBase64 } })
    }

    const contents = [...historyContents]
    if (currentParts.length > 0) {
      contents.push({ role: "user", parts: currentParts })
    }

    async function callGemini(contentsToSend: unknown[]) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction,
            contents: contentsToSend,
            tools: [{ functionDeclarations: TOOLS }],
          }),
        }
      )
      if (!res.ok) {
        console.error("Erro na API do Gemini:", await res.text())
        return null
      }
      return res.json()
    }

    const first = await callGemini(contents)
    if (!first) {
      return new Response(JSON.stringify({ error: "Erro ao chamar o Gemini" }), { status: 502 })
    }

    const parts = first.candidates?.[0]?.content?.parts ?? []
    const functionCallPart = parts.find((p: { functionCall?: { name: string } }) => p.functionCall)

    if (functionCallPart?.functionCall?.name === "create_task") {
      const args = functionCallPart.functionCall.args as { title: string; description?: string; projectId: string }

      const { data: newTask, error: taskError } = await supabase.from("lt_tasks").insert({
        title: args.title,
        description: args.description ?? "",
        status: "todo",
        priority: "none",
        project_id: args.projectId,
        due_date: null,
        tags: [],
        recurring: null,
        position: 0,
        assignee: null,
      }).select().single()

      if (taskError || !newTask) {
        console.error("Erro ao criar tarefa:", taskError)
        return new Response(JSON.stringify({ error: "Erro ao criar tarefa" }), { status: 500 })
      }

      return new Response(JSON.stringify({ message: `Pronto! Criei a tarefa "${args.title}".`, taskCreated: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    if (functionCallPart?.functionCall?.name === "search_tasks") {
      const args = functionCallPart.functionCall.args as { query: string }
      const { data: found } = await supabase
        .from("lt_tasks")
        .select("title, status")
        .ilike("title", `%${args.query}%`)
        .limit(10)

      const followUpContents = [
        ...contents,
        { role: "model", parts: [{ functionCall: functionCallPart.functionCall }] },
        { role: "user", parts: [{ functionResponse: { name: "search_tasks", response: { results: found ?? [] } } }] },
      ]

      const second = await callGemini(followUpContents)
      const secondText = second?.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text
      return new Response(JSON.stringify({ message: secondText ?? "Não encontrei nada." }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const textPart = parts.find((p: { text?: string }) => p.text)
    return new Response(JSON.stringify({ message: textPart?.text ?? "Não consegui entender, pode repetir?" }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("Erro:", err)
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
  }
})
