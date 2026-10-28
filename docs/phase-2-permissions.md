# Fase 2 — proposta de permissões

Proposta para revisão; estas permissões ainda não foram implementadas. Base: PDF Documentacao_Promessa_Industrial_Gestao_de_Projetos e decisões posteriores do responsável. Uma única igreja, pessoas separadas das contas de acesso e vínculo com múltiplos ministérios.

| Recurso / ação | Administrador global | Líder | Membro |
|---|---|---|---|
| Criar/editar/desativar ministérios | Sim | Não | Não |
| Nomear/remover líderes e conceder permissões | Sim | Não | Não |
| Criar contas, redefinir acesso e desativar contas | Sim | Não | Não |
| Consultar cadastro central de pessoas | Sim | Somente pessoas vinculadas ao próprio ministério, campos autorizados | Próprio cadastro |
| Cadastrar/editar dados centrais de pessoas | Sim | Solicitar alteração ao administrador | Solicitar correção dos próprios dados |
| Vincular pessoa já cadastrada ao ministério | Sim | Se houver permissão explícita, apenas no próprio ministério | Não |
| Desvincular pessoa do ministério | Sim | Se houver permissão explícita, apenas no próprio ministério | Não |
| Eventos, escalas e recursos do ministério | Todas as ações autorizadas | Ações concedidas no próprio ministério | Consultar os itens publicados para si |
| Projetos/tarefas atuais | Preservar regras existentes | Preservar regras existentes | Preservar regras existentes |
| Notas privadas | Somente próprias | Somente próprias | Somente próprias |
| Consultar auditoria | Sim | Apenas eventos permitidos do próprio ministério | Não |
| Excluir definitivamente pessoa ou histórico | Fora do fluxo comum; decisão específica | Não | Não |

## Regras de implementação

- Negar acesso por padrão. Verificar recurso, ação, ministério e vínculo ativo no backend, inclusive em chamadas diretas.
- Ser líder em um ministério não concede acesso a outro. Permissões configuráveis, sem nomes de ministérios fixados no código.
- Pessoa pode existir sem login. Desativar vínculo ou conta preserva histórico e revoga acesso; não apaga a pessoa.
- Cadastro de contas exclusivamente administrativo. Senha temporária exige troca antes de acessar dados, imposta pelo backend; nunca gravar senha em tabelas do aplicativo ou logs.
- Guardar nome completo; exibir primeiro nome e primeiro sobrenome.
- Dados pessoais não devem se tornar um diretório geral para membros. Definir campos visíveis por papel antes da migration.
- Toda alteração administrativa deve registrar autor, ação, entidade e data, sem segredos.

## Decisões para fechar antes de desenvolver

1. Aprovar ou ajustar a proposta de que líderes solicitem alterações no cadastro central, mas possam administrar vínculos mediante permissão.
2. Definir campos obrigatórios e sensíveis do cadastro, incluindo membro/visitante, telefone e data de nascimento.
3. Definir retenção da auditoria e quem autoriza exclusões definitivas.

## Validação prevista

Testes de isolamento entre ministérios, líder sem concessão, membro, pessoa sem login, conta desativada, múltiplos vínculos e troca obrigatória de senha. Verificar também que notas privadas e regras atuais de projetos não mudaram. Publicar uma vez após concluir e testar a etapa.
