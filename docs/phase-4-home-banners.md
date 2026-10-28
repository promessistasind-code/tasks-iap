# Página inicial e banners — 28/10/2026

Entrega 4A do PDF: nova página Início com cinco indicadores e carrossel. Dashboard continua separado com seus gráficos. Inclui a correção solicitada: membros/líderes veem só seus vínculos no menu lateral e todo o catálogo na visão geral, com os demais ministérios bloqueados e sem contagens.

Banners têm imagem privada, descrição acessível, título opcional, botão HTTPS opcional e início/fim de publicação. O servidor filtra período e habilitação. A página agenda nova leitura no próximo limite de publicação e ao receber foco, sem consultas periódicas frequentes. O carrossel permite pausa e navegação, pausa durante interação e respeita movimento reduzido.

Administradores gerais gerenciam banners e concedem permissão individual a contas com vínculo ativo na Comunicação. Administradores comuns e líderes não recebem essa permissão implicitamente. A remoção do vínculo ou da concessão revoga a capacidade no backend. A tela de concessão fica em Início > Gerenciar banners. Os registros de alterações ficam na auditoria sem expiração automática.

Imagens JPG/PNG/WebP de até 10 MB são redimensionadas para até 1920×1080 e convertidas para WebP, com limite final de 2 MB também imposto no bucket privado. Caminhos são únicos e não há sobrescrita ou exclusão nesta etapa. Substituir/desabilitar um banner preserva as imagens antigas; arquivos sem vínculo após falhas de gravação também ficam para a futura limpeza assistida.

Tarefas agora possuem completed_at controlado por trigger: conclusão grava a hora, reabertura limpa e alterações de outros campos preservam. Clientes não podem forjar a data. Tarefas antigas concluídas ficam sem data conhecida; não se inventou histórico para incluí-las no indicador. Atrasadas exclui o próprio dia de vencimento.

Validação: TypeScript, build, 6 testes unitários, 5 suítes de navegador (fundação, pessoas, permissões de tarefas, ministérios, início/banners), otimização real de imagem no navegador e inspeção visual móvel. SQL transacional com fixtures revertidas valida leitura anônima negada, rascunhos privados, uploads sem permissão negados, concessão só pelo administrador geral, perda de vínculo, períodos e links, além da data de conclusão não forjável. Lint das novas implementações sem erros; pendências legadas permanecem. Build mantém aviso anterior de bundle grande.

Migration aplicada: 20261028200913_home_announcements. Snapshot privado anterior salvo em backups/app-iap-before-home.json, SHA-256 ACAA8B7DC8917B5FB2153D4EDB659485BD4A4A8FD794FC9F885209DC9004A75E. Não houve exclusões de registros ou arquivos existentes. A migração é aditiva e compatível com o frontend anterior; recuperação preferencial é correção incremental. Não remover as tabelas/coluna após uso, pois isso perderia dados; qualquer reversão estrutural exige backup atualizado e migração específica.

Advisor: tabelas privadas com RLS e sem políticas diretas são intencionalmente inacessíveis, expostas apenas por projeções autorizadas. Persiste o aviso anterior de proteção de senhas vazadas: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Próximo bloco da fase 4: logotipo/nome global, favicon, foto individual e limpeza de imagens com prévia, seleção e confirmação do administrador geral. Nenhuma retenção ou exclusão automática foi implementada.
