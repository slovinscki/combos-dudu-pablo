BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS platform_fee_bps integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS validity_type text NOT NULL DEFAULT 'none';
ALTER TABLE products ADD COLUMN IF NOT EXISTS validity_days integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS validity_months integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS valid_from date;
ALTER TABLE products ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allowed_weekdays smallint[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::smallint[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_uses integer NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS booking_instructions text;

ALTER TABLE combo_orders ADD COLUMN IF NOT EXISTS purchase_date date;
ALTER TABLE combo_orders ADD COLUMN IF NOT EXISTS platform_fee_bps integer NOT NULL DEFAULT 0;
ALTER TABLE combo_orders ADD COLUMN IF NOT EXISTS platform_fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE combo_orders ADD COLUMN IF NOT EXISTS partner_balance_cents integer NOT NULL DEFAULT 0;
ALTER TABLE combo_orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_applicable';
ALTER TABLE combo_orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE combo_orders ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS platform_fee_bps integer NOT NULL DEFAULT 0;
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS platform_fee_cents integer NOT NULL DEFAULT 0;
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS partner_balance_cents integer NOT NULL DEFAULT 0;
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS validity_type text NOT NULL DEFAULT 'none';
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS valid_from date;
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS valid_until date;
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS allowed_weekdays smallint[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::smallint[];
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS total_uses integer NOT NULL DEFAULT 1;
ALTER TABLE combo_order_items ADD COLUMN IF NOT EXISTS used_uses integer NOT NULL DEFAULT 0;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_platform_fee_bps_check;
ALTER TABLE products ADD CONSTRAINT products_platform_fee_bps_check CHECK (platform_fee_bps BETWEEN 0 AND 10000);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_validity_type_check;
ALTER TABLE products ADD CONSTRAINT products_validity_type_check CHECK (validity_type IN ('none', 'days', 'months', 'fixed_period'));
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_total_uses_check;
ALTER TABLE products ADD CONSTRAINT products_total_uses_check CHECK (total_uses > 0);
ALTER TABLE combo_orders DROP CONSTRAINT IF EXISTS combo_orders_payment_status_check;
ALTER TABLE combo_orders ADD CONSTRAINT combo_orders_payment_status_check CHECK (payment_status IN ('not_applicable', 'awaiting_pix', 'paid', 'cancelled', 'refunded'));
ALTER TABLE combo_orders DROP CONSTRAINT IF EXISTS combo_orders_status_check;
ALTER TABLE combo_orders ADD CONSTRAINT combo_orders_status_check CHECK (status IN ('pending_confirmation', 'confirmed', 'awaiting_pix', 'paid', 'partially_used', 'used', 'expired', 'cancelled'));
ALTER TABLE combo_order_items DROP CONSTRAINT IF EXISTS combo_order_items_uses_check;
ALTER TABLE combo_order_items ADD CONSTRAINT combo_order_items_uses_check CHECK (total_uses > 0 AND used_uses BETWEEN 0 AND total_uses);

UPDATE products SET
  name = '3 Designs', description = 'Pacote com direito a 3 atendimentos de design de sobrancelha.', price_cents = 11400,
  platform_fee_bps = 1500, validity_type = 'fixed_period', validity_days = NULL, validity_months = NULL,
  valid_from = DATE '2026-09-01', valid_until = DATE '2026-12-31', allowed_weekdays = ARRAY[2,3,4,5]::smallint[], total_uses = 3,
  booking_instructions = 'Agendamentos de terça a sexta-feira. A equipe da Fer enviará o canal de agendamento após a confirmação do PIX.', updated_at = now()
WHERE merchant_slug = 'fer-reinher' AND slug = 'design-3';

UPDATE products SET
  name = 'Lash Lifting + Design', description = 'Lash Lifting com design de sobrancelha.', price_cents = 15000,
  platform_fee_bps = 1500, validity_type = 'days', validity_days = 30, validity_months = NULL,
  valid_from = NULL, valid_until = NULL, allowed_weekdays = ARRAY[2,3,4,5]::smallint[], total_uses = 1,
  booking_instructions = 'Agendamentos de terça a sexta-feira. A equipe da Fer enviará o canal de agendamento após a confirmação do PIX.', updated_at = now()
WHERE merchant_slug = 'fer-reinher' AND slug = 'lash-design';

UPDATE products SET
  name = 'Micropigmentação de Sobrancelha', description = 'Micropigmentação de sobrancelha, sujeita à avaliação quando já existe procedimento anterior.', price_cents = 63000,
  platform_fee_bps = 1500, validity_type = 'months', validity_days = NULL, validity_months = 2,
  valid_from = NULL, valid_until = NULL, allowed_weekdays = ARRAY[2,3,4,5]::smallint[], total_uses = 1,
  booking_instructions = 'Agendamentos de terça a sexta-feira. A equipe da Fer enviará o canal de agendamento após a confirmação do PIX.', updated_at = now()
WHERE merchant_slug = 'fer-reinher' AND slug = 'micropigmentacao';

UPDATE combo_orders SET
  purchase_date = COALESCE(purchase_date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date),
  platform_fee_bps = 1500,
  platform_fee_cents = round(total_cents * 0.15)::integer,
  partner_balance_cents = total_cents - round(total_cents * 0.15)::integer,
  payment_status = CASE WHEN status = 'confirmed' THEN 'paid' WHEN status = 'cancelled' THEN 'cancelled' ELSE 'awaiting_pix' END,
  paid_at = CASE WHEN status = 'confirmed' THEN COALESCE(paid_at, updated_at) ELSE paid_at END
WHERE merchant_slug = 'fer-reinher';

UPDATE combo_order_items item SET
  platform_fee_bps = product.platform_fee_bps,
  platform_fee_cents = round(item.unit_price_cents * product.platform_fee_bps / 10000.0)::integer,
  partner_balance_cents = item.unit_price_cents - round(item.unit_price_cents * product.platform_fee_bps / 10000.0)::integer,
  validity_type = product.validity_type,
  valid_from = CASE WHEN product.validity_type = 'fixed_period' THEN product.valid_from ELSE orders.purchase_date END,
  valid_until = CASE
    WHEN product.validity_type = 'fixed_period' THEN product.valid_until
    WHEN product.validity_type = 'days' THEN orders.purchase_date + product.validity_days
    WHEN product.validity_type = 'months' THEN (orders.purchase_date + make_interval(months => product.validity_months))::date
    ELSE NULL END,
  allowed_weekdays = product.allowed_weekdays,
  total_uses = product.total_uses
FROM products product, combo_orders orders
WHERE item.product_id = product.id AND item.order_id = orders.id AND orders.merchant_slug = 'fer-reinher';

CREATE UNIQUE INDEX IF NOT EXISTS combo_orders_public_token_key ON combo_orders (public_token);

CREATE TABLE IF NOT EXISTS combo_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL REFERENCES combo_order_items(id) ON DELETE RESTRICT,
  scheduled_for date NOT NULL, status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS combo_appointments_one_active_per_item_date ON combo_appointments (order_item_id, scheduled_for) WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS combo_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), appointment_id uuid NOT NULL UNIQUE REFERENCES combo_appointments(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES combo_order_items(id) ON DELETE RESTRICT, used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS combo_appointments_item_idx ON combo_appointments (order_item_id, scheduled_for);
CREATE INDEX IF NOT EXISTS combo_usage_events_item_idx ON combo_usage_events (order_item_id, used_at);

COMMIT;
