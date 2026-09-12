BEGIN;

ALTER TABLE products ALTER COLUMN price_cents DROP NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_mode text NOT NULL DEFAULT 'order';
ALTER TABLE products ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_purchase_mode_check;
ALTER TABLE products ADD CONSTRAINT products_purchase_mode_check CHECK (purchase_mode IN ('order', 'contact'));

INSERT INTO products (merchant_slug, slug, name, description, price_cents, active, sort_order, entitlements, purchase_mode, rules)
VALUES
  (
    'pizzaria-varandas',
    'combo-casal',
    'Combo Casal ❤️',
    '1 Pizza Grande + Coca-Cola 2L. Exceto pizzas especiais. Pizzas sem borda.',
    9500,
    true,
    10,
    '[]'::jsonb,
    'order',
    '{"pizzaSize":"grande","specialPizzasAllowed":false,"crustAllowed":false}'::jsonb
  ),
  (
    'pizzaria-varandas',
    'combo-compartilhar',
    'Para Compartilhar 🍕🍺',
    '1 Pizza Grande + 4 Long Necks Corona. Exceto pizzas especiais. Pizzas sem borda.',
    12000,
    true,
    20,
    '[]'::jsonb,
    'order',
    '{"pizzaSize":"grande","specialPizzasAllowed":false,"crustAllowed":false}'::jsonb
  ),
  (
    'pizzaria-varandas',
    'combo-festa',
    'Combo Festa 🥳',
    'A partir de 6 pessoas. Rodízio de pizza + acompanhamentos. O jantar do aniversariante é por nossa conta.',
    NULL,
    true,
    30,
    '[]'::jsonb,
    'contact',
    '{"minimumPartySize":6}'::jsonb
  )
ON CONFLICT (merchant_slug, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  sort_order = EXCLUDED.sort_order,
  entitlements = EXCLUDED.entitlements,
  purchase_mode = EXCLUDED.purchase_mode,
  rules = EXCLUDED.rules,
  updated_at = now();

COMMIT;
