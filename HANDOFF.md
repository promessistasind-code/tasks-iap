# Handoff — migração pra login real (Supabase Auth)

> Documento histórico. As referências abaixo foram substituídas. Consulte README.md e docs/implementation.md para o projeto oficial app-iap e as correções atuais.

Contexto pra quem (ou qual sessão do Claude) pegar esse trabalho a partir daqui. Escrito em 14/08/2026.

## O que foi pedido

Substituir o antigo seletor fake de "Quem é você?" (identidade sem senha) por login de verdade, com:
- Cadastro de conta só por admin (sem auto-cadastro)
- Qualquer usuário logado pode criar projeto e convidar outros pra ele
- Admin controla, em Configurações, quem acessa qual projeto
- Senha nunca é "vista" — só resetável

## O que já está pronto e em produção

- Commit `ac246e0` (master): toda a migração de auth — `LoginPage`, `AuthContext`, `UsersPage`, `SettingsPage`, RLS por projeto, remoção completa do sistema antigo de colaboradores fake.
- Commit `4dc72cc` (master): correção de CORS nas duas edge functions (sem isso, a chamada travava pra sempre no preflight `OPTIONS`).
- SQL da migration (`profiles`, `lt_project_members`, `is_admin()`, `has_project_access()`, policies) já foi rodado pelo usuário no SQL Editor do Supabase — confirmado com `select * from profiles` retornando a conta admin (`lincoln@admin.com`, `is_admin: true`).
- As duas edge functions (`admin-create-user`, `admin-reset-password`) foram publicadas **manualmente pelo Dashboard** (Edge Functions → Code → colar → Deploy), porque o Supabase CLI do usuário estava logado numa conta sem acesso a esse projeto (`bplpowejgqukfsqxfhoj` não aparecia em `supabase projects list`) — nunca resolvemos qual conta é a certa, só contornamos via Dashboard.
- Deploy do frontend no Netlify (`lincoln-tasks.netlify.app`) confirmado no ar, com a tela de login nova funcionando — usuário conseguiu logar como `lincoln@admin.com` e ver a tela Usuários/Configurações.
- Um bug separado foi encontrado e corrigido: a sessão do Supabase Auth ficava travada eternamente carregando (`navigator.locks` com lock preso, sem nenhuma requisição de rede) num navegador que tinha `localStorage` com restos do sistema antigo (`lincoln-current-member-id`, `lincoln-active-tab`) misturados com uma sessão real. `localStorage.clear() + reload` destravou. Não sabemos ao certo se a causa raiz foi o lixo de chaves antigas ou algo específico do `@supabase/supabase-js@2.106.2` — não foi investigado a fundo.

## Bug NÃO resolvido — próximo passo

**Sintoma:** ao clicar "Criar usuário" em Usuários (nome: Santi, email: santi@admin.com, senha: 123456), o app mostra o toast verde "Usuário criado!" (ou seja, a edge function `admin-create-user` respondeu sem `error`), **mas**:
- O novo usuário não aparece na lista de Usuários do app depois da criação
- Não aparece em Authentication → Users no Supabase Dashboard

Isso é estranho porque a function só retorna sucesso depois de `auth.admin.createUser()` E o insert em `profiles` terem funcionado — então, ou algo está retornando um "sucesso" falso, ou existe algum problema de cache/refresh nas duas telas que estávamos checando.

**Não cheguei a confirmar** se isso é só uma tela desatualizada (F5 resolve) ou um bug real na function. Os próximos passos que pedi ao usuário e ainda não foram respondidos:
1. Dar F5 na lista de Usuários do Supabase Dashboard e na tela Usuários do app, pra descartar cache.
2. Se continuar faltando o usuário: Supabase Dashboard → Edge Functions → `admin-create-user` → aba **Logs** → tentar criar de novo → ver o que a function realmente fez/logou nessa tentativa.

Com acesso direto ao Supabase via conector (SQL + Logs de function), dá pra resolver isso rapidinho: rodar a criação de novo e olhar os logs em tempo real, ou simular a chamada da function diretamente via `curl`/SQL pra isolar se o problema é na function ou no refresh da UI.

## Coisas a saber sobre esse projeto

- **Workflow deste projeto**: por pedido explícito do usuário, todo trabalho vai direto pra `master` (sem branch de feature, sem pedir confirmação de commit/deploy a cada mudança) — a única exceção é quando uma mudança quebraria o app em produção até um passo manual do usuário ser feito antes (ex: essa migration inteira, que dependia do SQL/bootstrap/edge functions serem feitos primeiro).
- **SQL pro usuário rodar**: sempre em bloco de código no chat (não como arquivo anexado) — ele prefere copiar direto.
- **Projeto Supabase**: `bplpowejgqukfsqxfhoj`. O usuário tem várias contas/organizações Supabase diferentes — ao configurar um conector ou CLI, confirmar que está autenticado na conta que realmente é dona desse projeto (fizemos essa descoberta do jeito difícil, via `supabase projects list` não mostrando o projeto certo).
- **Netlify**: site `lincoln-tasks` (`lincoln-tasks.netlify.app`). Push pra `master` deveria disparar deploy automático via GitHub App — funcionou nas últimas vezes, mas já teve problema de autorização incompleta no passado (resolvido uma vez, mas vale confirmar se ainda está saudável).
- **Netlify MCP**: existe um conector Netlify já conectado na conta do usuário, mas ele pode estar desligado por chat (`enabledInChat: false`) — precisa ser habilitado nas configurações de conectores de cada conversa nova.
