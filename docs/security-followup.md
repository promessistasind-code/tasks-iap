# Revisão de segurança — 28/10/2026

## Dependências

Auditoria inicial: 20 alertas (1 crítico, 14 altos, 4 moderados, 1 baixo). Atualizações compatíveis aplicadas ao package-lock.json sem `--force`. Auditoria final: zero alertas conhecidos, incluindo dependências de desenvolvimento; relatório em dependency-audit.json. Isso representa o resultado do registro npm nesta data, não garantia de ausência de falhas.

Removido o pacote CLI shadcn, importado apenas pelo CSS. Estilos preservados integralmente de shadcn 4.23.0 em src/styles/shadcn.css com licença MIT em arquivo adjacente. Nenhum código executável da CLI foi incorporado. Futuras adições de componentes podem usar a CLI separadamente com versão auditada.

## Autenticação

Painel oficial confirmou organização Promessa Industrial no plano FREE. A proteção de senhas vazadas exige Pro ou superior; tentativa de salvar não persistiu e o advisor continua indicando desativada. Nenhuma mudança de plano ou cobrança foi realizada. Fonte: https://supabase.com/docs/guides/auth/password-security

Cadastro público estava habilitado. Desativado em Authentication > Sign In / Providers > Allow new users to sign up; estado confirmado após recarregar a página. Login existente permanece habilitado. Criação administrativa pela API Admin permanece o caminho previsto. Não foram alteradas senhas de usuários nem criadas novas contas reais.

## Validação

- TypeScript e build Vite aprovados.
- Três testes unitários aprovados.
- Testes de navegador com fixtures aprovados: StrictMode, deduplicação, comentários, recorrência no servidor, checklist duplicado, agrupamento Realtime, erros de carga, desmontagem, sete páginas e navegação móvel.
- SQL no banco oficial: foundation.sql e invite_edges.sql aprovados dentro de BEGIN/ROLLBACK. Cobrem criação de projeto, auto-inclusão negada, convite/aceitação/cancelamento, notas privadas e recorrência. Sem dados de teste persistentes.
- Sessão real aberta: projetos, diálogo de convite e notas carregam. Ambos os usuários já pertencem ao projeto, e o diálogo impede novos convites para eles. Não foi realizado um ciclo de convite entre duas sessões reais; a autorização foi verificada pelos testes SQL com papéis distintos.
- Lint: 46 erros anteriores, 46 atuais, nenhuma regressão. Aviso anterior de tamanho do bundle permanece.

## Próxima fase

Matriz proposta em phase-2-permissions.md. Pessoas e Ministérios ainda não implementados: primeiro fechar as decisões de campos, edição por líderes e retenção da auditoria.
