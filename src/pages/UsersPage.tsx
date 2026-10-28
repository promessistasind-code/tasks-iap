import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import {
  CONSENT_NOTICE,
  peopleApi,
  membershipPayload,
  type Membership,
  type Ministry,
  type Person,
} from "@/lib/people"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  birthDate: "",
  consent: false,
  password: "",
  invitation: false,
}
function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full bg-muted transition-colors before:absolute before:top-1 before:left-1 before:size-4 before:rounded-full before:bg-background before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  )
}
export function UsersPage() {
  const { access, session, refreshAccess } = useAuth()
  const admin = !!access?.isAdmin,
    manager = admin || !!access?.isLeader
  const [directory, setDirectory] = useState<Person[]>([]),
    [people, setPeople] = useState<Person[]>([])
  const [catalog, setCatalog] = useState<Ministry[]>([]),
    [mine, setMine] = useState<Membership[]>([])
  const [view, setView] = useState<"directory" | "management">(
    manager ? "management" : "directory"
  )
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false)
  const [search, setSearch] = useState(""),
    [target, setTarget] = useState<Person | null>(null)
  const [create, setCreate] = useState<null | "account" | "person" | "edit">(
      null
    ),
    [form, setForm] = useState(emptyForm)
  const [reset, setReset] = useState<Person | null>(null),
    [password, setPassword] = useState("")
  const [membership, setMembership] = useState<Membership | null>(null)
  const [request, setRequest] = useState<Person | null>(null),
    [message, setMessage] = useState("")
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]),
    [showAudit, setShowAudit] = useState(false)
  const [requests, setRequests] = useState<
    { id: string; person_id: string; message: string }[]
  >([])
  const loadSequence = useRef(0)
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError("")
    try {
      const [d, p, c, m, r] = await Promise.all([
        peopleApi<Person[]>("directory"),
        manager ? peopleApi<Person[]>("management") : [],
        peopleApi<Ministry[]>("catalog"),
        peopleApi<Membership[]>("myMemberships"),
        admin ? peopleApi<typeof requests>("requests") : [],
      ])
      if (sequence === loadSequence.current) {
        setDirectory(d)
        setPeople(p)
        setCatalog(c)
        setMine(m)
        setRequests(r)
      }
    } catch (e) {
      if (sequence === loadSequence.current) {
        setDirectory([])
        setPeople([])
        setError(e instanceof Error ? e.message : "Falha ao carregar pessoas")
      }
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [manager, admin])
  useEffect(() => {
    let disposed = false
    queueMicrotask(() => {
      if (!disposed) void load()
    })
    const reload = () => void load()
    window.addEventListener("focus", reload)
    return () => {
      disposed = true
      // Invalidate the latest request, not the value captured when subscribing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadSequence.current++
      window.removeEventListener("focus", reload)
    }
  }, [load])
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      await load()
      await refreshAccess()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar")
      return false
    } finally {
      setBusy(false)
    }
  }
  function editPerson(p: Person) {
    setTarget(p)
    setForm({
      ...emptyForm,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email ?? "",
      phone: p.phone ?? "",
      birthDate: p.birthDate ?? "",
      consent: !!p.consented,
    })
    setCreate("edit")
  }
  async function savePerson(e: React.FormEvent) {
    e.preventDefault()
    if (
      await run(
        async () => {
          if (create === "account") {
            const { data, error } = await supabase.functions.invoke(
              "admin-create-user",
              { body: form }
            )
            if (error || data?.error)
              throw new Error(data?.error ?? "Falha ao criar conta")
          } else
            await peopleApi("savePerson", {
              ...form,
              id: create === "edit" ? target?.id : undefined,
            })
        },
        create === "account"
          ? "Convite criado. Repasse o email e a senha temporária à pessoa."
          : "Cadastro salvo"
      )
    ) {
      setCreate(null)
      setForm(emptyForm)
    }
  }
  const shown = (view === "management" ? people : directory).filter((p) =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase())
  )
  function newMembership(person: Person, ministryId: string) {
    setMembership({
      person_id: person.id,
      ministry_id: ministryId,
      function_ids: [],
      leader: false,
      can_add: false,
      can_edit_roles: false,
      can_remove: false,
      active: true,
      added_by: session!.user.id,
    })
  }
  return (
    <main className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pessoas e usuários</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro, ministérios e permissões
          </p>
        </div>
        {admin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setForm(emptyForm)
                setCreate("person")
              }}
            >
              Pessoa sem login
            </Button>
            <Button
              onClick={() => {
                setForm(emptyForm)
                setCreate("account")
              }}
            >
              Convidar usuário
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={view === "directory" ? "default" : "outline"}
          onClick={() => setView("directory")}
        >
          Diretório
        </Button>
        {manager && (
          <Button
            variant={view === "management" ? "default" : "outline"}
            onClick={() => setView("management")}
          >
            Administração
          </Button>
        )}
        {admin && (
          <Button
            variant="outline"
            onClick={() =>
              void run(async () => {
                setAudit(await peopleApi("audit"))
                setShowAudit(true)
              }, "Histórico carregado")
            }
          >
            Auditoria
          </Button>
        )}
        <Button variant="outline" onClick={() => void load()}>
          Atualizar
        </Button>
      </div>
      {view === "management" && !admin && (
        <p className="text-sm">
          Aqui aparecem apenas as pessoas que você adicionou aos ministérios que
          lidera. Para adicionar alguém, selecione a pessoa no diretório.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Input
        placeholder="Buscar por nome"
        aria-label="Buscar por nome"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading ? (
        <p>Carregando…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <article key={p.id} className="space-y-3 rounded-lg border p-4">
              <h2 className="font-semibold">
                {p.firstName}{" "}
                {p.lastName || (p.userId ? "(cadastro pendente)" : "")}
              </h2>
              {p.email && <p className="text-sm break-all">{p.email}</p>}
              {p.phone && <p className="text-sm">{p.phone}</p>}
              {view === "management" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {p.userId ? "Conta de acesso" : "Pessoa sem login"} ·{" "}
                    {p.consented
                      ? "Consentimento registrado"
                      : "Aguardando consentimento"}
                  </p>
                  {admin && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => editPerson(p)}
                    >
                      Editar cadastro
                    </Button>
                  )}
                  {admin && p.userId && (
                    <>
                      <Toggle
                        label="Conta ativa"
                        checked={!!p.active}
                        disabled={busy}
                        onChange={(active) =>
                          void run(
                            () =>
                              peopleApi("account", {
                                userId: p.userId,
                                active,
                              }),
                            "Acesso atualizado"
                          )
                        }
                      />
                      {access?.isGeneralAdmin && (
                        <Toggle
                          label="Administrador"
                          checked={!!p.isAdmin}
                          disabled={busy}
                          onChange={(isAdmin) =>
                            void run(
                              () =>
                                peopleApi("account", {
                                  userId: p.userId,
                                  isAdmin,
                                }),
                              "Permissão atualizada"
                            )
                          }
                        />
                      )}
                      {p.userId !== session?.user.id && (
                        <Toggle
                          label="Redefinir senha"
                          checked={reset?.id === p.id}
                          disabled={busy}
                          onChange={(v) => {
                            setReset(v ? p : null)
                            setPassword("")
                          }}
                        />
                      )}
                    </>
                  )}
                  {(p.memberships ?? []).map((m) => (
                    <div key={m.ministry_id} className="border-t pt-2 text-sm">
                      <strong>
                        {catalog.find((c) => c.id === m.ministry_id)?.name}
                      </strong>
                      <p>
                        {m.active
                          ? m.leader
                            ? "Líder"
                            : "Membro"
                          : "Vínculo inativo"}
                      </p>
                      <p>
                        {catalog
                          .find((c) => c.id === m.ministry_id)
                          ?.functions.filter((f) =>
                            m.function_ids.includes(f.id)
                          )
                          .map((f) => f.name)
                          .join(", ") || "Sem função selecionada"}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setMembership(m)}
                      >
                        Funções e permissões
                      </Button>
                    </div>
                  ))}
                </>
              )}
              {manager && (
                <label className="block text-sm">
                  Adicionar ao ministério
                  <select
                    aria-label={`Adicionar ${p.firstName} ao ministério`}
                    className="w-full rounded border bg-background p-2"
                    value=""
                    onChange={(e) => newMembership(p, e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {catalog
                      .filter(
                        (c) =>
                          admin ||
                          mine.some(
                            (m) =>
                              m.ministry_id === c.id && m.leader && m.can_add
                          )
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {!admin && (p.phone || p.userId === session?.user.id) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRequest(p)
                    setMessage("")
                  }}
                >
                  Solicitar correção
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {admin && requests.length > 0 && (
        <section className="space-y-3 rounded border p-4">
          <h2 className="font-semibold">Solicitações de correção</h2>
          {requests.map((r) => (
            <div key={r.id}>
              <p>
                {people.find((p) => p.id === r.person_id)?.firstName}:{" "}
                {r.message}
              </p>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => peopleApi("resolveRequest", { id: r.id }),
                    "Solicitação concluída"
                  )
                }
              >
                Marcar como resolvida
              </Button>
            </div>
          ))}
        </section>
      )}
      <Dialog
        open={!!create}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setCreate(null)
            setForm(emptyForm)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {create === "account"
                ? "Convidar usuário"
                : create === "person"
                  ? "Nova pessoa"
                  : "Editar cadastro"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={savePerson} className="space-y-3">
            {create === "account" && (
              <Toggle
                label="A pessoa preenche os próprios dados no primeiro acesso"
                checked={form.invitation}
                onChange={(invitation) =>
                  setForm((f) => ({ ...f, invitation, consent: false }))
                }
              />
            )}
            {(!form.invitation || create !== "account") &&
              (
                [
                  ["firstName", "Nome", "text"],
                  ["lastName", "Sobrenome", "text"],
                  ["phone", "Telefone", "tel"],
                  ["birthDate", "Data de nascimento", "date"],
                ] as const
              ).map(([key, label, type]) => (
                <label className="block" key={key}>
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
            <label className="block">
              Email
              <Input
                type="email"
                required
                disabled={create === "edit" && !!target?.userId}
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </label>
            {create === "account" && (
              <>
                <label className="block">
                  Senha temporária
                  <Input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                  />
                </label>
                <p className="text-xs">
                  Repasse as instruções à pessoa. A senha deve ser trocada no
                  primeiro acesso. Nenhum email é enviado automaticamente.
                </p>
              </>
            )}
            {!form.invitation && (
              <>
                <p className="rounded border p-3 text-sm">{CONSENT_NOTICE}</p>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    required={create === "person"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, consent: e.target.checked }))
                    }
                  />
                  A pessoa já aprovou este aviso e autorizou o cadastro.
                </label>
                {create === "account" && (
                  <p className="text-xs">
                    Se não houver autorização registrada, a própria pessoa
                    deverá aprovar no primeiro acesso.
                  </p>
                )}
              </>
            )}
            <Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reset}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setReset(null)
            setPassword("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha de {reset?.firstName}</DialogTitle>
          </DialogHeader>
          <p>
            A pessoa precisará entrar novamente e trocar a senha temporária. O
            controle volta para desligado ao concluir.
          </p>
          <label>
            Senha temporária
            <Input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button
            disabled={busy || password.length < 12}
            onClick={() =>
              void (async () => {
                if (
                  await run(async () => {
                    const { data, error } = await supabase.functions.invoke(
                      "admin-reset-password",
                      { body: { userId: reset?.userId, newPassword: password } }
                    )
                    if (error || data?.error)
                      throw new Error(data?.error ?? "Falha ao redefinir senha")
                  }, "Senha redefinida")
                ) {
                  setReset(null)
                  setPassword("")
                }
              })()
            }
          >
            Confirmar redefinição
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!membership}
        onOpenChange={(v) => {
          if (!v && !busy) setMembership(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {catalog.find((c) => c.id === membership?.ministry_id)?.name}
            </DialogTitle>
          </DialogHeader>
          {membership && (
            <div className="space-y-3">
              {catalog
                .find((c) => c.id === membership.ministry_id)
                ?.functions.map((f) => (
                  <Toggle
                    key={f.id}
                    label={f.name}
                    checked={membership.function_ids.includes(f.id)}
                    onChange={(v) =>
                      setMembership((m) =>
                        m
                          ? {
                              ...m,
                              function_ids: v
                                ? [...m.function_ids, f.id]
                                : m.function_ids.filter((id) => id !== f.id),
                            }
                          : m
                      )
                    }
                  />
                ))}
              <hr />
              <Toggle label="Pode criar projetos neste ministério" checked={!!membership.can_create_projects} onChange={(can_create_projects) => setMembership({...membership, can_create_projects})} />
              <Toggle label="Pode criar tarefas neste ministério" checked={!!membership.can_create_tasks} onChange={(can_create_tasks) => setMembership({...membership, can_create_tasks})} />
              <Toggle
                label="Vínculo ativo"
                checked={membership.active}
                onChange={(active) => setMembership({ ...membership, active })}
              />
              {admin && (
                <>
                  <Toggle
                    label="Líder deste ministério"
                    checked={membership.leader}
                    onChange={(leader) =>
                      setMembership({ ...membership, leader })
                    }
                  />
                  <Toggle
                    label="Pode adicionar membros"
                    checked={membership.can_add}
                    onChange={(can_add) =>
                      setMembership({ ...membership, can_add })
                    }
                  />
                  <Toggle
                    label="Pode alterar funções dos membros que adicionou"
                    checked={membership.can_edit_roles}
                    onChange={(can_edit_roles) =>
                      setMembership({ ...membership, can_edit_roles })
                    }
                  />
                  <Toggle
                    label="Pode desativar vínculos que adicionou"
                    checked={membership.can_remove}
                    onChange={(can_remove) =>
                      setMembership({ ...membership, can_remove })
                    }
                  />
                </>
              )}
              <Button
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    if (
                      await run(
                        () =>
                          peopleApi(
                            "membership",
                            membershipPayload(membership)
                          ),
                        "Vínculo salvo"
                      )
                    )
                      setMembership(null)
                  })()
                }
              >
                Salvar permissões
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!request}
        onOpenChange={(v) => {
          if (!v) setRequest(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar correção</DialogTitle>
          </DialogHeader>
          <textarea
            aria-label="Correção solicitada"
            className="rounded border p-2"
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            disabled={busy || !message.trim()}
            onClick={() =>
              void (async () => {
                if (
                  await run(
                    () =>
                      peopleApi("requestChange", {
                        personId: request?.id,
                        message,
                      }),
                    "Solicitação enviada"
                  )
                )
                  setRequest(null)
              })()
            }
          >
            Enviar ao administrador
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={showAudit} onOpenChange={setShowAudit}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Auditoria</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Histórico sem expiração automática. São exibidos 100 registros por
            página.
          </p>
          {audit.map((a) => (
            <div className="border-b py-2 text-xs" key={String(a.id)}>
              <p>
                {String(a.created_at)} — {String(a.action)}
              </p>
              <p>
                Autor: {String(a.actor_id)} · Registro: {String(a.entity_id)}
              </p>
            </div>
          ))}
          {audit.length === 100 && (
            <Button
              onClick={() =>
                void run(
                  async () =>
                    setAudit(
                      await peopleApi("audit", { before: audit.at(-1)?.id })
                    ),
                  "Página carregada"
                )
              }
            >
              Mais antigos
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
