# Repertório por evento

## Regras atuais desde 06/11/2026

Celebração e Comunicação compartilham a biblioteca musical. Suas lideranças podem editar músicas nos eventos do próprio ministério. Em Pessoas e usuários, a administração geral pode delegar essa permissão a um membro desses dois ministérios e a escrita de roteiro a membros ou lideranças de qualquer ministério. Salvar o repertório inclui as músicas na biblioteca. As cópias dos eventos são independentes.

A migração `20261106132236_ministry_content_permissions` implementou essa separação. Os testes de Pastor e Secretaria passaram após a aplicação. O texto abaixo documenta a implantação anterior.

## Histórico de 05/11/2026

Estado em 05/11/2026: backend aplicado no Supabase oficial; frontend preparado para GitHub. Nenhum deploy Netlify realizado. Builds da Netlify permanecem parados; publicar o frontend é uma etapa separada.

## Funções

- Repertório com músicas ordenadas (título, tom, versão/intérprete, cifra e link HTTP/HTTPS) e roteiro do evento.
- Administrador geral habilita o recurso por ministério. Administrador geral e liderança responsável editam; participantes e ministérios com acesso ao evento apenas consultam. Eventos cancelados são somente leitura. Desabilitar preserva dados.
- Biblioteca por ministério: busca com páginas de 50 músicas, gravação independente do evento, deduplicação e arquivamento confirmado. Adicionar uma música ao evento cria uma cópia editável; alterações nessa cópia não modificam a biblioteca. Arquivar preserva cópias existentes.
- Repetição de eventos pode copiar músicas e roteiro. A opção começa desligada e exige repertório salvo e versão atual. Cada ocorrência recebe uma cópia independente, na mesma transação de criação da série.

## Segurança e persistência

Gravações exigem versão atual e geram auditoria. Tabelas privadas com RLS e acesso direto revogado; funções verificam identidade e autorização. Limites: 100 músicas, título/tom/versão de até 200 caracteres, cifra de 10 mil, link de 2 mil e roteiro de 20 mil. Links não são carregados automaticamente. Cifras são texto, sem execução de HTML.

Repertórios são retidos após exclusão do evento, mas não podem ser consultados sem um evento existente e autorizado. Nenhum ministério real foi habilitado durante os testes.

Migrações aplicadas:
- `20261104215858_event_repertoire.sql`
- `20261105032607_repertoire_library.sql`
- `20261105130342_repertoire_series.sql`

A função compartilhada de agendamento foi mantida após comparação com a definição real: os trechos existentes ficaram iguais fora das adições de repertório. A definição anterior está em `supabase/rollback/scheduling_before_repertoire_series.sql`; revisar antes de qualquer uso, pois restaurá-la remove o suporte à cópia de repertório.

## Validação e limites

TypeScript, lint direcionado, build e oito testes unitários passaram. Testes de navegador com dados simulados validaram edição, consulta, cancelamento, biblioteca e envio da opção/versão na repetição. Ensaios SQL de repertório, biblioteca e séries passaram em transações revertidas, incluindo permissões, versão obsoleta, deduplicação e independência das cópias. Após a última migração, `repertoire-series.sql` e `scheduling_workflows.sql` passaram novamente.

A reexecução de `ministry_observers.sql` após a última migração permanece pendente: duas solicitações do conector expiraram na confirmação, sem executar o teste. Os advisors não apresentaram novos avisos; proteção contra senhas vazadas permanece desconsiderada conforme decisão do usuário no plano gratuito.

O histórico Git recuperado pelo OneDrive estava incompleto. A atualização do GitHub usa um checkout íntegro da master remota como base, preservando seu histórico e incorporando o código recuperado e as implementações acima.
