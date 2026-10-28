import { useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { CONSENT_NOTICE, peopleApi, type AccountStatus } from "@/lib/people"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AccountOnboarding({ status }: { status: AccountStatus }) {
  const { refreshAccess, signOut } = useAuth()
  const [form, setForm] = useState({
    firstName: status.firstName,
    lastName: status.lastName,
    phone: status.phone,
    birthDate: status.birthDate ?? "",
  })
  const [consent, setConsent] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      if (status.passwordRequired) {
        if (password.length < 12 || password !== confirmation)
          throw new Error(
            "Use pelo menos 12 caracteres e confirme a mesma senha."
          )
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setPassword("")
        setConfirmation("")
      } else {
        await peopleApi("complete", { ...form, consent })
      }
      await refreshAccess()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível concluir. Tente novamente."
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4">
        <h1 className="text-2xl font-bold">
          {status.passwordRequired
            ? "Defina sua senha pessoal"
            : "Complete seu cadastro"}
        </h1>
        <p className="text-sm text-muted-foreground">{status.email}</p>
        {status.resetInProgress ? (
          <p>
            A redefinição de senha está em andamento. Aguarde o administrador
            concluir e entre novamente.
          </p>
        ) : status.passwordRequired ? (
          <>
            <label className="block">
              Nova senha
              <Input
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block">
              Confirme a senha
              <Input
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <p className="text-sm">
              A senha temporária deve ser substituída antes de acessar o
              sistema.
            </p>
          </>
        ) : status.consented ? (
          <p>
            Sua sessão precisa ser renovada. Saia e entre novamente. Se o
            problema persistir, fale com um administrador.
          </p>
        ) : (
          <>
            {(
              [
                ["firstName", "Nome", "text"],
                ["lastName", "Sobrenome", "text"],
                ["phone", "Telefone", "tel"],
                ["birthDate", "Data de nascimento", "date"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key} className="block">
                {label}
                <Input
                  type={type}
                  required
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: e.target.value }))
                  }
                />
              </label>
            ))}
            <p className="rounded border p-3 text-sm">{CONSENT_NOTICE}</p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Li o aviso e autorizo a utilização e a visibilidade dos meus dados
              conforme descrito.
            </label>
            <p className="text-sm text-muted-foreground">
              Sem sua aprovação, o cadastro não será ativado e os dados não
              serão publicados no diretório.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={signOut}>
            Sair
          </Button>
          {!status.resetInProgress &&
            (status.passwordRequired || !status.consented) && (
              <Button disabled={busy || (!status.passwordRequired && !consent)}>
                {busy ? "Salvando…" : "Continuar"}
              </Button>
            )}
        </div>
      </form>
    </main>
  )
}
