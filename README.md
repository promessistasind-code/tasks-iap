# Promessa Industrial — Gestão de Projetos

Aplicação interna de tarefas, projetos, notas privadas e calendário, construída com React, TypeScript, Vite e Supabase.

- Produção: https://app-iap-ind.netlify.app
- Repositório: `promessistasind-code/tasks-iap`, branch `master`.
- Supabase oficial: `app-iap` / `hnplfnxlmkdxpvqqrden`.
- Netlify: conta **Promessistas Ind**, site `app-iap-ind`.

## Desenvolvimento

Use Node.js 24 e `npm ci`. Configure `.env.local`, sem versionar chaves:

```dotenv
VITE_SUPABASE_URL=https://hnplfnxlmkdxpvqqrden.supabase.co
VITE_SUPABASE_ANON_KEY=<chave publicável do projeto>
```

Nunca use chave de serviço no frontend. Execute `npm run dev`, `npm run build` e `npm test`.

## Segurança e banco

Contas são criadas por administradores. Projetos usam RLS por associação; criar um projeto inclui seu criador atomicamente. Envio e resposta de convites usam RPCs validadas no backend. Notas pertencem exclusivamente ao autor, inclusive perante outros administradores.

A recorrência é gerada pelo banco na transação de conclusão, com checklist persistido e um único sucessor por tarefa de origem.

`supabase/schema/schema.sql` é o **bootstrap legado**. Para instalações vazias, execute esse bootstrap e depois as migrations em `supabase/migrations`, em ordem. Não execute o bootstrap em produção nem use suas permissões antigas isoladamente. Canto e Inbox são eliminados pela segunda migration.

Somente `admin-create-user` e `admin-reset-password` estão publicados no projeto oficial. Os protótipos restantes de integrações externas não são ativados por esta entrega. O webhook de notas exige segredo, número exato autorizado e `WHATSAPP_NOTE_OWNER_ID` definido no servidor.

## Verificação e recuperação

- `npm test`: testes de estado e timeout.
- `npm run test:browser`: testes com Playwright instalado no ambiente. Use `TEST_URL` para apontar ao servidor Vite local e `TEST_BROWSER_CHANNEL=msedge` para usar Edge. As chamadas Supabase são simuladas.
- `supabase/tests/foundation.sql` e `invite_edges.sql`: testes de autorização; execute dentro de `BEGIN` e sempre finalize com `ROLLBACK`.
- `node scripts/check-lint-regressions.mjs`: compara o lint atual com o commit local de referência.

Leia [o registro da implementação](docs/implementation.md) antes de aplicar ou reverter migrations. Backups privados ficam fora do repositório. Concentre alterações e testes antes de um único push, pois `master` dispara a publicação.
