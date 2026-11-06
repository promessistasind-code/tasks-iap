# Avisos de escala e solicitações

O sino reúne convites de projeto, novas escalas, alterações de horário, cancelamentos, reaberturas e decisões de troca. A atualização ocorre ao abrir o sino, voltar à janela e a cada minuto com a página visível. Marcar como lido não confirma presença. Os avisos são internos ao sistema.

Cada participante com vínculo ativo recebe uma atualização por evento mesmo que tenha várias funções. A alteração mais recente substitui a anterior para evitar informações contraditórias. Os avisos de decisão são individuais por pedido. Quando o solicitante perde acesso ao evento, pode consultar o resultado da própria troca, sem detalhes nem link para o evento.

Em **Solicitações → Meus pedidos**, cada pessoa acompanha as trocas e correções cadastrais que enviou. Em **Para decidir**, a liderança vê as trocas pendentes da sua escala e a administração vê as solicitações sob sua responsabilidade. Aprovar, recusar, cancelar ou marcar uma correção como resolvida utiliza as operações existentes. Resolver uma correção encerra o pedido; a edição do cadastro é feita em Pessoas e usuários. A central apresenta 25 itens por página.

O teste SQL `supabase/tests/schedule_updates_and_requests.sql` usa dados fictícios e termina com rollback. O teste de navegador `tests/events-browser.mjs` cobre a entrada pelo sino e a aprovação pela central.
