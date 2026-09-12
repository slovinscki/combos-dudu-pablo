# Combo Club

Projeto unificado do Combo Club. A raiz funciona como hub e cada parceiro mantém uma rota própria:

- `/` — Combo Club
- `/pizzaria-varandas-combos/` — Pizzaria Varandas
- `/fer-reinher-estetista/` — Fer Reinher Estetista
- `/admin/` — disponibilidade, leads, pedidos e créditos da Fer

## Configuração local

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env.local`.
3. Configure `DATABASE_URL` e um `ADMIN_TOKEN` longo e exclusivo.
4. Execute a migration `migrations/001_unified_combo_platform.sql` em uma branch de teste do Neon antes de aplicá-la ao banco usado pela Vercel.
5. Inicie com `npx vercel dev`.

O painel solicita o `ADMIN_TOKEN` e o mantém apenas na sessão do navegador.

## Disponibilidade

Cada combo da Fer utiliza `products.active`, além dos campos opcionais `starts_at` e `ends_at`. O painel altera somente `active`. Desativar uma oferta impede novas solicitações no backend e não remove pedidos, itens ou créditos existentes.

## Fluxos para validar antes do deploy

1. **Design:** selecione “3 Designs”, preencha nome e telefone e envie. Deve surgir um pedido de R$ 114,00 com três créditos de design pendentes; ao confirmar no painel, os créditos ficam disponíveis.
2. **Lash + Design:** envie o combo de R$ 150,00. Deve surgir um pedido com um crédito de Lash Lifting e um de Design.
3. **Micropigmentação — Não:** responda “Não” e envie. Deve surgir um pedido de R$ 630,00 e um crédito de micropigmentação.
4. **Micropigmentação — Sim:** responda “Sim”. O backend não cria pedido; registra um lead identificado como Combo Micropigmentação e o exibe em “Leads para avaliação”.
5. **Proteção do backend:** envie o slug de micropigmentação sem a resposta. A API deve retornar HTTP 400. Com resposta “Sim”, deve retornar HTTP 202 e nunca criar pedido.
6. **Oferta encerrada:** desative um combo no painel, recarregue a página da Fer e confirme botão inativo. Uma chamada direta à API para esse combo deve retornar HTTP 409.
7. **Preservação:** depois de desativar, confirme que pedidos e créditos anteriores continuam visíveis no painel.
8. **Responsividade:** verifique `/`, Varandas, Fer e `/admin/` em 390 px e 1280 px, sem rolagem horizontal inesperada.

Não há integração de pagamento neste repositório. Uma solicitação nasce como `pending_confirmation`; somente a confirmação administrativa libera os créditos.
