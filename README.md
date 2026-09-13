# Combo Club

Projeto unificado do Combo Club. A raiz funciona como hub e cada parceiro mantém uma rota própria:

- `/` — Combo Club
- `/pizzaria-varandas-combos/` — Pizzaria Varanda (slug técnico legado preservado)
- `/fer-reinher-estetista/` — Fer Reinher Estetista
- `/admin/` — disponibilidade, leads, reservas, pedidos e créditos dos parceiros

## Configuração local

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env.local`.
3. Configure `DATABASE_URL`, um `ADMIN_TOKEN` longo e exclusivo e os dados PIX (`PIX_KEY`, `PIX_MERCHANT_NAME`, `PIX_MERCHANT_CITY`). Não há chave PIX real versionada no repositório.
4. Execute, em ordem, `migrations/001_unified_combo_platform.sql`, `002_pizzaria_varanda_combos.sql` e `003_fer_payment_validity_and_usage.sql` em uma branch de teste do Neon antes de aplicá-las ao banco usado pela Vercel.
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

## Pagamento e utilização da Fer Reinher

- A entrada é calculada no backend com inteiros em centavos: `round(total * platform_fee_bps / 10000)`. Para a Fer, `platform_fee_bps = 1500` (15%).
- O PIX copia e cola contém somente a entrada. O saldo da Fer é persistido separadamente e não é tratado como recebível do ComboClub.
- A confirmação do PIX é administrativa neste estágio porque ainda não há provedor/webhook de pagamento configurado. O cliente pode consultar a confirmação usando o token público opaco devolvido na compra.
- A validade é copiada para cada item no momento da compra. “3 Designs” vale de 01/09/2026 a 31/12/2026; Lash + Design soma 30 dias; Micropigmentação soma 2 meses-calendário.
- Agendamentos e consumos ficam no backend. A Fer aceita somente terça a sexta; um evento de utilização é único por agendamento, impedindo dupla contabilização.

### Teste local dos três combos

1. Configure uma branch de teste do Neon, aplique as três migrations e rode `npm test`.
2. Inicie `npx vercel dev` e abra `/fer-reinher-estetista/`.
3. Para cada combo, preencha nome, telefone e e-mail; gere o PIX e confira respectivamente R$ 17,10, R$ 22,50 e R$ 94,50.
4. No `/admin/`, marque a compra como `Pago`; volte à tela da compra e use “Verificar pagamento” para conferir a confirmação, o saldo e a validade.
5. No painel, tente agendar uma segunda-feira (deve ser rejeitada) e uma terça a sexta dentro do prazo (deve ser aceita). Marque a utilização duas vezes e confirme que a contagem cresce apenas uma vez.

Pedidos da Pizzaria Varanda continuam usando `pending_confirmation`/`confirmed` e não recebem regra de PIX, percentual ou validade da Fer.
