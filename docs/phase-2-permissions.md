# Pessoas, ministérios e permissões — decisões de 28/10/2026

Implementação baseada nas respostas do responsável. Cadastro público permanece desativado. Pessoas podem existir sem conta de login e ter múltiplos vínculos e funções.

## Cadastro e consentimento

- Nome, sobrenome, telefone, nascimento e email são obrigatórios para ativar o cadastro.
- Somente administrador cria uma pessoa ou conta. Pode cadastrar os dados completos ou criar um convite com email e senha temporária para a própria pessoa preencher o restante.
- O convite não envia email automaticamente. O administrador repassa as instruções e a senha temporária à pessoa.
- O administrador pode registrar autorização já obtida. Caso contrário, o primeiro acesso exige a aprovação pessoal do aviso. Convite sem aprovação é uma conta pendente: não aparece no diretório e não acessa módulos do sistema.
- As contas existentes não recebem aprovação automática. Devem completar os dados e aprovar o aviso no próximo acesso.
- Troca de senha temporária obrigatória antes do acesso, verificada no banco por alteração real da senha no Supabase Auth. O cliente não pode marcar a troca como concluída.
- Nome e sobrenome são visíveis para usuários autenticados com cadastro ativo. Contatos são visíveis para a própria pessoa, administradores e líderes dos ministérios aos quais ela pertence. Ano e data completa de nascimento apenas para a própria pessoa e administradores.
- Dia e mês alimentam aniversários anuais no calendário geral. Nenhuma idade é publicada. Aniversário de 29/02 é lembrado em 28/02 nos anos não bissextos.

## Administração

| Ação | Administrador geral | Outro administrador | Líder | Membro |
|---|---|---|---|---|
| Criar pessoa ou convidar usuário | Sim | Sim | Não | Não |
| Editar cadastro central | Sim | Sim | Solicitar correção | Solicitar própria correção |
| Conceder administração global | Sim | Não | Não | Não |
| Ativar/desativar contas comuns | Sim | Sim | Não | Não |
| Alterar contas dos administradores gerais | Protegidas no fluxo comum | Não | Não | Não |
| Redefinir senha de outra conta comum | Sim | Sim | Não | Não |
| Redefinir senha de outro administrador geral | Sim | Não | Não | Não |
| Nomear líder e conceder permissões ministeriais | Sim | Sim | Não | Não |
| Adicionar vínculo ministerial | Sim | Sim | Com permissão, no próprio ministério | Não |
| Alterar funções | Sim | Sim | Com permissão, apenas vínculos que adicionou | Não |
| Desativar vínculo ministerial | Sim | Sim | Com permissão, apenas vínculos que adicionou | Não |
| Consultar auditoria | Sim | Sim | Não | Não |
| Autorizar futura exclusão definitiva | Somente as duas contas designadas | Não | Não | Não |
| Notas privadas | Somente próprias | Somente próprias | Somente próprias | Somente próprias |

Administradores gerais designados: denisson2010@hotmail.com e promessistasind@gmail.com. Os IDs dessas contas foram verificados; mudar um email de perfil não concede essa autoridade. Não há exclusão definitiva de pessoas/contas exposta nesta entrega: desativação preserva histórico. Uma futura operação de exclusão exige autorização desses administradores e avaliação das dependências, sem cascata indiscriminada.

A página Pessoas e usuários tem Diretório e Administração. O diretório segue a visibilidade aprovada; a área administrativa do líder só retorna os vínculos que ele adicionou aos ministérios que lidera. Função operacional não concede liderança automaticamente. Cada vínculo tem controles separados para liderança, adicionar membros, alterar funções e desativar vínculos.

Redefinir senha é uma ação, não uma permissão persistente: abre confirmação, volta para desligado após sucesso/cancelamento e não indica sucesso em caso de falha. Sessões anteriores são revogadas e o usuário precisa entrar e trocar a senha. Redefinições concorrentes são bloqueadas. Após falha externa, a conta permanece bloqueada e o administrador pode repetir depois de cinco minutos.

## Catálogo inicial

| Ministério | Funções |
|---|---|
| Ministério de Celebração | baterista, baixista, vocalista, ministrante, guitarrista, violonista, tecladista, operador de som |
| Ministério de Comunicação | operador de projeção, fotografia, filmagem, operador de iluminação, operador de live, media social, operador de som |
| Ministério de Ensino | Mensageiro, Professor |
| Ministério de mulheres | Colaboradora |
| Ministério de Homens | Colaborador |
| Junta Diaconal | Recepção, Limpeza, Auxiliar de ceia |
| Ministério de Crianças e adolescentes | Professor, Professora, Auxiliar de sala |
| Ministério de Proclamação | Colaborador |
| Ministério de Jovens | Professor, Professora, Auxiliar de sala, Colaborador |
| Ministério de Recepção | Recepção |
| Ministério de Intercessão | Intercessor, Colaborador |
| Pastor | Titular, Auxiliar |

Total: 12 ministérios e 35 funções. Uma pessoa pode ter várias funções por ministério. Não há vínculos nem líderes atribuídos automaticamente aos usuários existentes.

## Segurança, testes e recuperação

- Dados pessoais em schema privado com RLS; RPCs expõem somente os campos autorizados. Email removido dos privilégios de leitura direta de profiles.
- Restrições adicionais bloqueiam tarefas, projetos, notas, arquivos e convites antes de consentimento/troca obrigatória ou após desativação, sem substituir as regras anteriores de propriedade.
- Auditoria sem expiração automática, com autor, ação, alvo e instante; nunca registra senhas. Consulta paginada em 100 itens.
- Testes SQL: isolamento por ministério e autor do vínculo, campos privados, consentimento, senha, sessão antiga, revogação, tentativa de auto-promoção, provisionamento e redefinições concorrentes. Executar people_ministries.sql dentro de BEGIN/ROLLBACK.
- Testes anteriores de projetos, convites, notas e recorrência continuam executáveis com fixtures adaptadas ao novo bloqueio.
- Testes de navegador: primeiro acesso sem consultas aos módulos, aceite explícito, convite, funções múltiplas, controle de redefinição, calendário e tela restrita do líder; testes de aniversário incluem 29/02.
- Backup privado anterior à migration em ../backups/app-iap-before-phase2.json, fora do repositório. SHA-256: 63d6258c2812156d083dec7c00c4df227f0652afe3b4c1885541ba5c699476d5. Inclui dados públicos, funções, políticas, privilégios e versões anteriores das duas Edge Functions. Arquivo relido e estrutura/contagens verificadas.
- A migration não apaga registros existentes. A alteração do nome exibido preserva responsáveis de tarefas que ainda usam nome como referência; homônimos ambíguos interrompem a mudança para revisão administrativa.
- Preferir correção para frente. Não reaplicar o rollback antigo da fundação após esta etapa: ele não conhece consentimento, privacidade de contatos nem bloqueio de senha. Uma reversão exige preservar as novas tabelas e manter os bloqueios de privacidade.

## Limites desta etapa

O catálogo inicial está fixado pela migration, não há editor de ministérios nesta entrega. Eventos, escalas e recursos ministeriais ainda não foram construídos. O diretório carrega os registros aprovados; paginação do diretório fica para crescimento de volume. A regra de nomes legada nas tarefas será substituída por IDs em uma evolução própria. Os erros de lint anteriores e o aviso de tamanho do bundle permanecem fora deste escopo.
