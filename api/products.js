import { getSql } from "./_db.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método não permitido." });
  }
  const merchant = String(request.query?.merchant ?? "").trim().toLowerCase();
  if (merchant && !/^[a-z0-9-]{2,60}$/.test(merchant)) return response.status(400).json({ error: "Parceiro inválido." });
  try {
    const sql = getSql();
    const products = merchant
      ? await sql`SELECT id, merchant_slug, slug, name, description, price_cents, image_url, purchase_mode, rules, platform_fee_bps, validity_type, validity_days, validity_months, valid_from, valid_until, allowed_weekdays, total_uses, booking_instructions, active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) AS available FROM products WHERE merchant_slug = ${merchant} ORDER BY sort_order, price_cents NULLS LAST`
      : await sql`SELECT id, merchant_slug, slug, name, description, price_cents, image_url, purchase_mode, rules, true AS available FROM products WHERE active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) ORDER BY sort_order, price_cents DESC NULLS LAST`;
    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return response.status(200).json({ products });
  } catch (error) {
    console.error("Falha ao consultar produtos", error);
    return response.status(500).json({ error: "Não foi possível carregar os combos." });
  }
}
