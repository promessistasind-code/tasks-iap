# Pastor, Secretaria e eventos pessoais por ministério

## Consulta e lista de eventos
O vínculo ativo com Pastor ou Secretaria concede consulta global a projetos, tarefas e conteúdo de colaboração das tarefas, além de eventos. São políticas SELECT adicionais; nenhum predicado de escrita de projetos/tarefas foi ampliado. Notas privadas e dados pessoais de contato mantêm suas regras anteriores. A permissão adicional de consulta não cancela permissões independentes previamente concedidas em outros ministérios. Ao inativar/remover o vínculo, a consulta adicional deixa de valer.

A Secretaria foi criada sem funções inventadas: pode ser atribuída pelo administrador no fluxo normal. O menu lateral continua limitado aos ministérios da pessoa. A consulta global é feita pelas telas Projetos e Calendário. A visão geral de ministérios conserva o catálogo e as restrições de entrada já aprovadas.

Na página de cada ministério, a seção Eventos e escalas consulta apenas atribuições ativas da própria pessoa naquele ministério, incluindo líderes/administradores. A lista é filtrada no servidor pelo usuário autenticado, não por um ID de pessoa enviado pelo navegador. O calendário continua exibindo todos os eventos visíveis do ministério, mesmo sem escala individual. Assim, líderes usam o calendário para administrar eventos em que não estejam pessoalmente escalados.

## Exceção pastoral
Integrante ativo de Pastor pode criar eventos sob o ministério Pastor e administrar os eventos que ele próprio criou. Outros eventos pastorais e de outros ministérios continuam somente para consulta, salvo outra permissão independente já concedida (liderança ou administrador). Não recebe permissão para criar projetos/tarefas somente por ser Pastor.

No evento de sua autoria, o pastor usa Escalar mensageiro. O servidor resolve a função Mensageiro do Ministério de Ensino, exige vínculo ativo, função atribuída, consentimento e disponibilidade. O cliente não escolhe outro ministério/função para esse comando. Pastor não pode usar a exceção para escalar Professor ou outros papéis. A pessoa escalada vê o evento e pode confirmar/recusar; não é necessário compartilhar todos os eventos de Pastor com todo o Ensino.

Trocas de Mensageiros podem ser aprovadas pelo pastor responsável por aquele evento, com revalidação de elegibilidade e conflito. Séries pastorais podem copiar esses mensageiros, mantendo nova presença pendente. Exclusão definitiva permanece reservada ao administrador geral, com cópia verificada.

## Validação e publicação
SQL com fixtures revertidas verificou consulta global e negação de UPDATE/DELETE/INSERT, revogação do vínculo, criação pastoral no ministério correto, bloqueio de outro pastor, filtro de Mensageiro, resposta do escalado, lista pessoal no ministério, calendário com evento não escalado, troca e recorrência pastorais. Regressões de eventos, recorrência/indisponibilidade/trocas e exclusão/projeto obrigatório foram executadas.

Por instrução de 30/10/2026: não publicar na Netlify nem atualizar a branch remota que dispara deploy. Banco Supabase atualizado e verificado; frontend permanece em desenvolvimento local até nova autorização de publicação. Não foi solicitado plano pago nem criação de ambiente cobrado.

Validação local final: 8 testes unitários e 7 suítes de navegador aprovados (observadores, eventos, agendamento, ministérios, permissões de tarefas, pessoas e projeto obrigatório). TypeScript e build aprovados. Lint permanece com 44 erros legados, sem novos erros nos componentes alterados.
