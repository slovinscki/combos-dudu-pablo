BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE products ADD COLUMN IF NOT EXISTS merchant_slug text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS entitlements jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE products SET merchant_slug = 'combo-club' WHERE merchant_slug IS NULL;
UPDATE products SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(id::text, 8) WHERE slug IS NULL;
ALTER TABLE products ALTER COLUMN merchant_slug SET NOT NULL;
ALTER TABLE products ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_merchant_slug_slug_key ON products (merchant_slug, slug);

INSERT INTO products (merchant_slug, slug, name, description, price_cents, active, sort_order, entitlements)
VALUES
  ('fer-reinher', 'design-3', '3 Designs de Sobrancelha', 'Pacote com direito a 3 atendimentos de design de sobrancelha.', 11400, true, 10, '[{"code":"design-sobrancelha","name":"Design de sobrancelha","units":3}]'::jsonb),
  ('fer-reinher', 'lash-design', 'Lash Lifting + Design', '1 Lash Lifting e 1 Design de sobrancelha.', 15000, true, 20, '[{"code":"lash-lifting","name":"Lash Lifting","units":1},{"code":"design-sobrancelha","name":"Design de sobrancelha","units":1}]'::jsonb),
  ('fer-reinher', 'micropigmentacao', 'Micropigmentação de Sobrancelha', '1 Micropigmentação de sobrancelha, sujeita à avaliação quando já existe procedimento anterior.', 63000, true, 30, '[{"code":"micropigmentacao-sobrancelha","name":"Micropigmentação de sobrancelha","units":1}]'::jsonb)
ON CONFLICT (merchant_slug, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, price_cents = EXCLUDED.price_cents, sort_order = EXCLUDED.sort_order, entitlements = EXCLUDED.entitlements, updated_at = now();

CREATE TABLE IF NOT EXISTS combo_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_slug text NOT NULL, customer_name text NOT NULL, customer_phone text NOT NULL, customer_email text,
  marketing_consent boolean NOT NULL DEFAULT false, has_previous_micropigmentation boolean, total_cents integer NOT NULL CHECK (total_cents >= 0),
  status text NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS combo_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES combo_orders(id) ON DELETE RESTRICT, product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_slug text NOT NULL, product_name text NOT NULL, unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0), quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS combo_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES combo_orders(id) ON DELETE RESTRICT, product_slug text NOT NULL,
  service_code text NOT NULL, service_name text NOT NULL, total_units integer NOT NULL CHECK (total_units > 0), used_units integer NOT NULL DEFAULT 0 CHECK (used_units >= 0 AND used_units <= total_units),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'completed', 'cancelled')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS combo_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_slug text NOT NULL, source_product_slug text NOT NULL, name text NOT NULL, phone text NOT NULL, email text,
  has_previous_micropigmentation boolean NOT NULL DEFAULT false, marketing_consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'evaluated', 'closed')), metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS combo_orders_merchant_created_idx ON combo_orders (merchant_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS combo_leads_merchant_created_idx ON combo_leads (merchant_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS combo_entitlements_order_idx ON combo_entitlements (order_id);

COMMIT;
