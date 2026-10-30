import { useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, Loader2 } from "lucide-react"

export function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setSubmitting(true)
    setError(null)
    const { error: err } = await signIn(email.trim(), password)
    setSubmitting(false)
    if (err) setError("E-mail ou senha incorretos.")
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* Left: branding */}
      <div className="hidden md:flex flex-col justify-center px-16 bg-muted/30 relative overflow-hidden">
        <div className="relative z-10 flex flex-col gap-6 max-w-md">
          <div className="flex items-center gap-2.5">
            <img src="/logo.jpg" alt="" className="size-10 rounded-xl" />
            <span className="text-2xl font-bold">Ind On</span>
          </div>
          <h1 className="text-4xl font-bold leading-tight">
            Gestão de projetos, sem enrolação.
          </h1>
          <p className="text-muted-foreground">
            Tarefas, projetos e colaboração num só lugar.
          </p>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-6">
          <div className="md:hidden flex items-center gap-2.5 mb-2">
            <img src="/logo.jpg" alt="" className="size-8 rounded-lg" />
            <span className="text-lg font-bold">Ind On</span>
          </div>

          <h2 className="text-2xl font-bold">Que bom te ver.</h2>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              E-mail
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Senha
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Não tem uma conta? Fale com um administrador — o acesso é cadastrado manualmente.
          </p>
        </form>
      </div>
    </div>
  )
}
