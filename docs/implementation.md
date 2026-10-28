# Fundação de segurança e estabilidade

Referência: requisitos de Promessa Industrial e decisões de 27/10/2026. Esta entrega cobre a fundação autorizada. Pessoas, ministérios, equipe de tarefas, banners, eventos, escalas e demais fases do PDF continuam no planejamento. As decisões posteriores de remover Canto/Inbox e privatizar notas substituem a preservação desses módulos descrita no PDF.

## Mudanças

- Removida a auto-inclusão irrestrita em projetos; criação e associação do proprietário são atômicas.
- Convites imutáveis pelo cliente; envio, cancelamento e resposta usam autorização explícita, bloqueio por projeto e convite e índices únicos. Aceitação revalida o remetente e destinatário, bloqueia projeto suspenso e suporta repetição.
- Funções privilegiadas em schema privado com caminho de pesquisa fixo. Endpoints públicos invoker negam execução anônima.
- Notas com proprietário obrigatório e RLS em todas as operações. Inventário e backup confirmaram zero notas; a migration aborta se aparecer alguma antes da aplicação.
- Tarefas não podem ser transferidas para projeto sem acesso. Suspensão bloqueia alterações na tarefa e nas subtabelas de trabalho.
- Recorrência e checklist persistidos pelo banco na transação de conclusão. Unicidade por origem evita regeneração em repetições, reaberturas e concorrência; clientes não podem forjar a origem.
- Store dividido em carregamento/ciclo Realtime, mapeadores, operações de projeto e atualização de estado. Filhos são carregados apenas para tarefas visíveis. Eventos são agrupados, sem consultas simultâneas, e erros preservam os últimos dados com opção de tentar novamente.
- Limpeza de canais, listeners, temporizadores e requisições ao desmontar; estado isolado por usuário. Atualizações Realtime não restauram snapshots antigos de comentários e checklists.
- Duplicação usa IDs reais do novo checklist. Indicador de gravação conta operações concorrentes. Exclusão individual mantém cinco segundos para desfazer; encerrar a sessão nesse período cancela a exclusão pendente.
- Corrigidos duplo toggle de fixação de notas, temporizadores de timeout e espera por Supabase dentro do callback de autenticação.
- Retirados frontend e funções dependentes de Inbox/Canto. Somente as duas funções administrativas estavam publicadas no projeto oficial; foram preservadas. Nenhuma integração externa foi ativada.
- Identidade exibida atualizada para Promessa Industrial — Gestão de Projetos.

## Backup confirmado antes da exclusão

Arquivos privados em `backups`, ao lado do checkout e fora do Git:

| Arquivo | SHA-256 |
|---|---|
| `app-iap-before-removal.json` | `9CCDD188EB00B12694029C236679427BBBDB15E89B162FD7A0750AAD080BD4BB` |
| `restore-removed-tables.sql` | `0AC85A06C3DA6E3841E912D95222612E7A62A718D2CED865222D9A3A5C6F7568` |

O JSON contém registros completos das tabelas afetadas e metadados: colunas, constraints, índices, policies, grants, funções, triggers e publicações. O script restaura estrutura, dados, policies, grants e publicação das seis tabelas retiradas.

| Tabela | Registros |
|---|---:|
| lt_inbox_items | 0 |
| lt_vocal_skills | 37 |
| lt_vocal_videos | 1 |
| lt_vocal_profile | 1 |
| lt_vocal_references | 0 |
| lt_vocal_class_notes | 0 |
| lt_notes | 0 |

Validação: leitura do arquivo salvo; hashes SHA-256; importação em tabelas temporárias com comparação de todos os campos; execução do script completo em schema descartável e comparação JSONB exata com a origem. Todos os ensaios foram revertidos. Integridade confirmada ao usuário antes da exclusão definitiva.

A migration de remoção bloqueia as seis tabelas, compara hashes do conteúdo e aborta se o backup estiver desatualizado. Usa DROP TABLE sem CASCADE: dependências inesperadas interrompem a operação. Bancos novos com tabelas vazias também são aceitos.

## Testes

- Verificação de tipos e compilação de produção.
- Três testes unitários: corrida evento/resposta, atualização imutável e liberação de temporizadores.
- Navegador com fixtures: StrictMode, deduplicação, comentários preservados, conclusão sem inserção pelo cliente, checklist com IDs novos, Realtime agrupado, recuperação de erro, limpeza após desmontar, sete páginas preservadas e navegação móvel. Máximo observado: uma consulta de tarefas em andamento.
- SQL com papéis reais do banco em transação descartada: proprietário automático, notas privadas entre usuários e perante admin, auto-inclusão e convite sem acesso negados, convite alheio negado, aceitação repetida, notificações não adulteráveis, recorrência mensal em fim de mês e checklist persistido.
- Casos adicionais: cancelamento, recusa, perda de acesso do remetente, projeto suspenso, origem recorrente não forjável e RPC anônima negada.
- Ensaio das duas migrations com esses testes e remoção das tabelas, seguido de ROLLBACK.
- Lint legado: 48 erros no commit original 4aea2dab1d94251eab991ae7fffb09d67da2905d; 46 após a remoção dos módulos. Nenhuma regressão. Stores e utilitários alterados passam no lint direcionado.

## Aplicação e recuperação

As migrations de segurança e remoção foram aplicadas no projeto oficial após os ensaios. Os arquivos locais usam as versões registradas no banco: `20261028022624` e `20261028022707`. O frontend foi preparado para um único push em master, sem publicações intermediárias.

Restaurar módulos retirados exige o script privado verificado e o frontend do histórico Git. Nunca publicar o backup no repositório.

Para problemas de interface, preferir corrigir o frontend mantendo a segurança do banco. `supabase/rollback/foundation.sql` é um plano de emergência: preserva tarefas e registros, mas reintroduz permissões legadas. Aborta se houver notas privadas para impedir sua exposição. Revisar e aplicar como nova migration, com backup atualizado; não faz parte do deploy normal.

## Pendências anteriores e limites

- Lint legado requer manutenção própria.
- Auditoria de dependências: 20 alertas anteriores, incluindo um crítico em dependência de ferramenta. Não foi executado audit fix --force nem atualização geral. O site é estático; alertas não comprovam exploração no frontend. Planejar atualização com testes de compatibilidade.
- Proteção de senhas vazadas do Supabase estava desabilitada. Revisar configuração de Auth e disponibilidade no plano; esta entrega não altera cobrança nem configurações de autenticação fora do escopo.
- Após aplicar a segurança, o advisor não apontou mais problemas nas funções ou no RLS. Restou somente o aviso de proteção de senhas vazadas.
- A lista carrega tarefas visíveis e filhos. Para volumes grandes, planejar paginação e históricos sob demanda.
- Navegador usa fixtures; autorização é testada por SQL com os papéis do banco, sem senhas de usuários existentes.
