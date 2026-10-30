# Limpeza de vínculos inativos

Em Pessoas e usuários, cada vínculo inativo tem o botão Excluir vínculo inativo para administradores gerais. O botão pede confirmação com o nome da pessoa e do ministério. Vínculos ativos precisam ser desativados e salvos primeiro.

O servidor exige administrador geral com conta pronta, trava o registro e compara a versão integral com a prévia confirmada. Antes de apagar, grava a linha completa em `private.people_audit`, ação `membership.removed`, campo `details.backup`, e lê novamente para conferir igualdade. Falha na cópia, alteração concorrente ou falta de confirmação impede a exclusão. Tudo ocorre na mesma transação. A cópia na auditoria tem retenção sem expiração; é uma cópia de recuperação do vínculo dentro do banco, não um backup externo completo do banco.

A ação remove somente a linha de vínculo. Não apaga pessoa, conta, ministério, tarefas, projetos ou escalas. O vínculo poderá ser criado novamente pelo fluxo normal. A auditoria permanece disponível ao administrador e permite reconstrução da linha via `jsonb_populate_record`, sem substituir vínculos posteriores.

Validação: teste SQL revertido verifica administrador geral, bloqueio de líder, bloqueio de anônimo, vínculo ativo, confirmação obrigatória, prévia alterada, remoção duplicada, cópia integral e restauração exata. Teste de navegador com dados simulados verifica botão só no vínculo inativo, cancelamento, remoção da lista, preservação da pessoa e ausência para líder. Nenhum vínculo real foi removido durante a implementação.

Reversão da funcionalidade: restaurar a versão anterior do frontend e revogar EXECUTE da nova RPC. Preservar auditoria e vínculos existentes. Referência: [funções do Supabase](https://supabase.com/docs/guides/database/functions).
