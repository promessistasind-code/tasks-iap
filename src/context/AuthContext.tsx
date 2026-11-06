import { createContext, useContext } from "react"
import type { Session } from "@supabase/supabase-js"
import type { Profile } from "@/types/auth"
import type { AccountStatus } from "@/lib/people"

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  access: AccountStatus | null
  accessError: string | null
  refreshAccess: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
