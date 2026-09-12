# Combo Club

Projeto unificado do Combo Club. A raiz funciona como hub e cada parceiro mantém uma rota própria:

- `/` — Combo Club
- `/pizzaria-varandas-combos/` — Pizzaria Varanda (slug técnico legado preservado)
- `/fer-reinher-estetista/` — Fer Reinher Estetista
- `/admin/` — disponibilidade, leads, reservas, pedidos e créditos dos parceiros

## Configuração local

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env.local`.
3. Configure `DATABASE_URL` e um `ADMIN_TOKEN` longo e exclusivo.
4. Execute, em ordem, `migrations/001_unified_combo_platform.sql` e `migrations/002_pizzaria_varanda_combos.sql` em uma branch de teste do Neon antes de aplicá-las ao banco usado pela Vercel.
5. Inicie com `npx vercel dev`.

O painel solicita o `ADMIN_TOKEN` e o mantém apenas na sessão do navegador.

## Disponibilidade

Cada combo utiliza `products.active`, além dos campos opcionais `starts_at` e `ends_at`. O painel altera somente `active`. Desativar uma oferta impede novas solicitações no backend e não remove pedidos, itens, leads ou créditos existentes.

O identificador técnico `pizzaria-varandas` e a rota `/pizzaria-varandas-combos/` foram preservados para não quebrar registros e links; o nome público correto é **Pizzaria Varanda**.

## Fluxos para validar antes do deploy

1. **Design:** selecione “3 Designs”, preencha nome e telefone e envie. Deve surgir um pedido de R$ 114,00 com três créditos de design pendentes; ao confirmar no painel, os créditos ficam disponíveis.
2. **Lash + Design:** envie o combo de R$ 150,00. Deve surgir um pedido com um crédito de Lash Lifting e um de Design.
3. **Micropigmentação — Não:** responda “Não” e envie. Deve surgir um pedido de R$ 630,00 e um crédito de micropigmentação.
4. **Micropigmentação — Sim:** responda “Sim”. O backend não cria pedido; registra um lead identificado como Combo Micropigmentação e o exibe em “Leads para avaliação”.
5. **Proteção do backend:** envie o slug de micropigmentação sem a resposta. A API deve retornar HTTP 400. Com resposta “Sim”, deve retornar HTTP 202 e nunca criar pedido.
6. **Oferta encerrada:** desative um combo no painel, recarregue a página da Fer e confirme botão inativo. Uma chamada direta à API para esse combo deve retornar HTTP 409.
7. **Preservação:** depois de desativar, confirme que pedidos e créditos anteriores continuam visíveis no painel.
8. **Responsividade:** verifique `/`, Varandas, Fer e `/admin/` em 390 px e 1280 px, sem rolagem horizontal inesperada.

### Pizzaria Varanda

1. **Combo Casal:** selecione o combo, confirme explicitamente “pizza não especial e sem borda” e envie. Deve criar um pedido de R$ 95,00.
2. **Para Compartilhar:** repita o fluxo e confirme um pedido de R$ 120,00.
3. **Regra obrigatória:** tente enviar sem marcar a confirmação. O formulário deve impedir; uma chamada direta à API também deve retornar HTTP 400.
4. **Pizza especial:** envie `pizzaSelections` com `isSpecial: true` ou categoria `especial`. A API deve retornar HTTP 400.
5. **Borda:** envie `pizzaSelections` com `hasCrust: true`, `stuffedCrust: true` ou uma borda diferente de `none`/`sem borda`. A API deve retornar HTTP 400.
6. **Combo Festa:** selecione-o sozinho. O total deve mostrar “Consulta / reserva”, nunca R$ 0,00. Informe no mínimo 6 pessoas; a API deve criar um lead, não um pedido.
7. **Festa abaixo do mínimo:** envie 5 pessoas e confirme HTTP 400.
8. **Disponibilidade:** desative cada oferta no painel e confirme botão inativo e HTTP 409 para chamadas diretas.

Não existe catálogo de sabores ou bordas neste repositório. Por isso essas opções não são oferecidas no frontend. As condições aparecem antes do envio, exigem confirmação e são validadas defensivamente no backend caso uma futura etapa envie `pizzaSelections`. A escolha do sabor elegível continua sujeita à confirmação da equipe.

Não há integração de pagamento neste repositório. Uma solicitação nasce como `pending_confirmation`; somente a confirmação administrativa libera os créditos.
