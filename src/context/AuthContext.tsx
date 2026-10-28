import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import type { Profile } from "@/types/auth"

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    color: row.color as string,
    initials: row.initials as string,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at as string,
  }
}

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let currentUserId: string | null = null
    let profileTimer: ReturnType<typeof setTimeout> | undefined
    async function loadProfile(userId: string) {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).single()
      if (active && currentUserId === userId) setProfile(data ? mapProfile(data) : null)
    }
    let settled = false
    function finishLoading() {
      if (active && !settled) { settled = true; setLoading(false) }
    }

    async function init() {
      try {
        const { data: { session: s } } = await supabase.auth.getSession()
        if (!active) return
        currentUserId = s?.user.id ?? null
        setSession(s)
        if (s) await loadProfile(s.user.id)
      } finally { finishLoading() }
    }
    void init().catch(() => {})

    // Blindagem: se a checagem inicial de sessão travar (ex: alguma chamada
    // de auth presa sem nunca resolver nem dar erro), não deixa o app preso
    // no spinner pra sempre — depois de 8s segue como se não tivesse sessão,
    // o usuário só precisa logar de novo.
    const timeoutId = setTimeout(finishLoading, 8000)

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return
      if (currentUserId !== (s?.user.id ?? null)) setProfile(null)
      currentUserId = s?.user.id ?? null
      setSession(s)
      clearTimeout(profileTimer)
      // Do not await Supabase calls inside its auth callback: that can deadlock
      // the auth lock used by the request's token lookup.
      if (s) profileTimer = setTimeout(() => { void loadProfile(s.user.id) }, 0)
      else setProfile(null)
    })

    return () => {
      active = false
      clearTimeout(profileTimer)
      clearTimeout(timeoutId)
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    // Limpa o estado local (e o token salvo) na hora — não espera o servidor
    // responder. Se essa chamada de rede travar (ex: sessão presa), o usuário
    // não fica trancado dentro do app sem conseguir sair.
    setSession(null)
    setProfile(null)
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith("sb-"))
        .forEach(k => localStorage.removeItem(k))
    } catch {
      // localStorage indisponível — segue o baile, o estado em memória já foi limpo
    }
    supabase.auth.signOut().catch(() => {})
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, isAdmin: !!profile?.isAdmin, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
