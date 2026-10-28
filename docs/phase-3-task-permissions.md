# Projetos e tarefas por ministério

Cada projeto novo pertence a um ministério. Os projetos existentes foram preservados sem atribuição automática; um administrador pode selecionar o ministério em **Projetos → Editar**. Somente administradores podem transferir projetos entre ministérios.

Na administração de pessoas, **Funções e permissões** oferece dois controles independentes, desligados por padrão: **Pode criar projetos neste ministério** e **Pode criar tarefas neste ministério**. O administrador e o líder podem concedê-los. A administração de vínculos pelo líder continua limitada às pessoas que ele adicionou, conforme a decisão anterior. Os líderes têm criação e edição no próprio ministério; a permissão não se estende a outros ministérios.

Os membros ativos do ministério podem visualizar seus projetos. Convites explícitos de projeto continuam funcionando. Somente administradores, líderes do ministério e proprietários do projeto podem convidar pessoas. O acesso concedido por convite permanece independente do vínculo com o ministério.

## Responsável e equipe

- Administradores, proprietário do projeto e líderes do ministério podem editar as tarefas do projeto, independentemente de quem as criou.
- O responsável pode editar a tarefa enquanto tiver acesso ao projeto. Sua identidade é armazenada pelo identificador da conta; nomes iguais ou alteração de nome não transferem responsabilidade.
- A equipe pode ler os campos, checklist, links e histórico, adicionar comentários e excluir seus próprios comentários. Não pode alterar os campos principais ou o checklist.
- Demais leitores do projeto visualizam a tarefa. Para criar, precisam da permissão específica concedida pelo líder ou administrador.
- Criar uma tarefa não concede edição permanente. Ao atribuí-la a outra pessoa, o criador conserva somente as permissões que tiver por outro motivo. Sem responsável escolhido, a criação atribui a tarefa ao próprio criador.
- Duplicar exige permissão de criação; a cópia inicia sob responsabilidade de quem duplicou, preservando a equipe elegível e reiniciando o checklist.
- Projetos suspensos bloqueiam alterações de tarefas por não administradores.

A recorrência é transacional, preserva responsável/equipe elegíveis e checklist, e não depende de liberar criação manual ao responsável. O histórico de criação e troca de responsável/equipe é registrado na mesma transação da tarefa.

## Verificação e reversão

As migrações foram divididas em etapas para evitar expiração da integração. Não removem tabelas nem registros. O backup privado anterior à etapa contém dados das 19 tabelas, funções, políticas, colunas, permissões e gatilhos; fica fora do repositório. SHA-256: `01c87a5bf014aa8f84884d9c5e27ba27509a184b9f3ab7a0d5ec89fd3d6e43fd`.

Os testes SQL usam identidades fictícias e devem ser executados dentro de `BEGIN` / `ROLLBACK`:

- `task_permissions.sql` seguido de `task_collaboration.sql`: isolamento entre ministérios, edição do líder, equipe, responsável, recorrência, autoria, nomes iguais e revogação de acesso.
- `task_permissions.sql` seguido de `ministry_creation.sql`: concessões independentes, revogação, histórico e ausência de edição residual do criador.
- `foundation.sql` seguido de `invite_edges.sql`: notas privadas, convites e recorrência anteriores.
- `people_ministries.sql`: privacidade e permissões do cadastro central.

`npm test` cobre os testes unitários. `npm run test:browser` inclui regressão do aplicativo, pessoas e cinco perfis de acesso, usando dados fictícios.

Para reverter a etapa, primeiro capture um novo backup. Restaure funções, políticas e permissões anteriores usando o snapshot privado e remova os gatilhos novos de atribuição/histórico. Preserve as novas colunas para não perder ministério, equipe e responsável; não execute exclusões de dados como parte de uma reversão de código. A reversão precisa ser coordenada com o frontend.

Permanecem avisos anteriores: lint legado e tamanho do pacote JavaScript. O aviso de proteção contra senhas vazadas continua limitado pelo plano do Supabase; não houve alteração dessa configuração nesta etapa.
