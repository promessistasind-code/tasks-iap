# Etapa 5A — eventos, escalas e calendário

Eventos possuem ministério responsável, nome, descrição, local, início e término. Líderes do ministério responsável e administradores gerais criam/alteram eventos. Compartilhar permite consulta aos membros dos ministérios convidados e gestão de suas próprias atribuições por seus líderes. O ministério responsável não muda na edição.

Cada atribuição exige integrante ativo, cadastro autorizado e função correspondente no ministério. A pessoa escalada confirma ou recusa apenas sua participação. Adições repetidas não duplicam a atribuição. Retirar uma atribuição a inativa, preservando histórico. Cancelar um evento preserva dados e bloqueia alterações na escala. Mudar início/término ou reabrir evento cancelado devolve respostas a pendente.

Calendário: mês, semana e dia; filtros de tarefas, eventos e ministério; aniversários gerais preservados, além de notas e anexos das tarefas. Eventos que atravessam dias aparecem em cada dia abrangido, excluindo o dia de término quando termina exatamente à meia-noite. Horários usam o fuso do dispositivo. O ministério também tem sua lista mensal de eventos e escalas.

Segurança: tabelas privadas com RLS e sem permissões diretas; entrada por RPC validada no servidor, verificação de conta ativa/consentida, acesso por ministério e bloqueio para anônimos. Escritas são transacionais, com trava por evento; versão impede sobrescrever edição concorrente. Auditoria sem expiração. A correção posterior adicionou exclusão definitiva somente para administrador geral, com confirmação e cópia integral verificada na auditoria; detalhes em `event-deletion-task-project.md`. Compartilhamento revogado remove acesso do ministério convidado; o histórico das atribuições permanece visível aos demais participantes autorizados.

Atualização: listas recarregam ao voltar à janela ou após ações locais. Não há atualização instantânea entre dispositivos nesta etapa. Erros preservam restrições de acesso e oferecem nova tentativa na lista. As alterações de acesso são sempre revalidadas pelo servidor.

Validação: testes SQL com usuários fictícios em transação revertida verificam criação, consulta, escala por ministério, função válida, idempotência, resposta própria, bloqueio de outsiders/anônimos/acesso direto, revogação de compartilhamento, edição concorrente, cancelamento e nova confirmação por mudança de horário. Testes de navegador usam dados simulados e cobrem criação, compartilhamento, três visões, filtros, inclusão em escala, confirmação/recusa, ações indisponíveis ao membro e tela móvel. Testes de datas cobrem vários dias e meia-noite. Verificação de tipos e build de produção; lint conserva os 44 erros legados sem erros nos novos componentes.

O aviso informativo de RLS sem políticas nas tabelas privadas é esperado: acesso direto é negado, operações passam pela RPC. Permanece o aviso pré-existente de proteção contra senhas vazadas desativada (ver [Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).

Próxima etapa: recorrência de eventos, indisponibilidades e trocas de escala. Notificações automáticas de escala e repertório não fazem parte desta entrega.

Reversão: publicar o frontend anterior desativa a interface sem perder os novos registros. Não remover tabelas após uso real sem backup verificado. As migrations são aditivas e não excluem dados dos módulos existentes.
