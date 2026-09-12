import { getSql } from "../_db.js";
import { requireAdmin } from "../_auth.js";

function parseBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body ?? {};
}

export default async function handler(request, response) {
  if (!requireAdmin(request, response)) return;
  const sql = getSql();
  try {
    if (request.method === "GET") {
      const [products, leads, orders] = await Promise.all([
        sql`SELECT id, merchant_slug, slug, name, price_cents, purchase_mode, active, starts_at, ends_at FROM products WHERE merchant_slug IN ('fer-reinher', 'pizzaria-varandas') ORDER BY merchant_slug, sort_order`,
        sql`SELECT id, merchant_slug, name, phone, email, source_product_slug, has_previous_micropigmentation, status, metadata, created_at FROM combo_leads WHERE merchant_slug IN ('fer-reinher', 'pizzaria-varandas') ORDER BY created_at DESC LIMIT 100`,
        sql`SELECT o.id, o.merchant_slug, o.customer_name, o.customer_phone, o.customer_email, o.total_cents, o.status, o.created_at, COALESCE(json_agg(json_build_object('serviceName', e.service_name, 'totalUnits', e.total_units, 'usedUnits', e.used_units, 'status', e.status)) FILTER (WHERE e.id IS NOT NULL), '[]') AS entitlements FROM combo_orders o LEFT JOIN combo_entitlements e ON e.order_id = o.id WHERE o.merchant_slug IN ('fer-reinher', 'pizzaria-varandas') GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100`,
      ]);
      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json({ products, leads, orders });
    }
    if (request.method === "POST") {
      const body = parseBody(request);
      if (body.action === "set_product_availability") {
        if (typeof body.active !== "boolean") return response.status(400).json({ error: "Disponibilidade inválida." });
        const merchantSlug = String(body.merchantSlug ?? "");
        if (!["fer-reinher", "pizzaria-varandas"].includes(merchantSlug)) return response.status(400).json({ error: "Parceiro inválido." });
        const [product] = await sql`UPDATE products SET active = ${body.active}, updated_at = now() WHERE merchant_slug = ${merchantSlug} AND slug = ${String(body.slug)} RETURNING slug, active`;
        if (!product) return response.status(404).json({ error: "Combo não encontrado." });
        return response.status(200).json({ product });
      }
      if (body.action === "set_lead_status") {
        const allowed = ["new", "contacted", "evaluated", "closed"];
        if (!allowed.includes(body.status)) return response.status(400).json({ error: "Status inválido." });
        const [lead] = await sql`UPDATE combo_leads SET status = ${body.status}, updated_at = now() WHERE id = ${String(body.id)} RETURNING id, status`;
        if (!lead) return response.status(404).json({ error: "Lead não encontrado." });
        return response.status(200).json({ lead });
      }
      if (body.action === "set_order_status") {
        const allowed = ["pending_confirmation", "confirmed", "cancelled"];
        if (!allowed.includes(body.status)) return response.status(400).json({ error: "Status inválido." });
        const entitlementStatus = body.status === "confirmed" ? "available" : body.status === "cancelled" ? "cancelled" : "pending";
        const results = await sql.transaction([
          sql`UPDATE combo_orders SET status = ${body.status}, updated_at = now() WHERE id = ${String(body.id)} RETURNING id, status`,
          sql`UPDATE combo_entitlements SET status = ${entitlementStatus}, updated_at = now() WHERE order_id = ${String(body.id)} AND used_units = 0`,
        ]);
        if (!results[0]?.length) return response.status(404).json({ error: "Pedido não encontrado." });
        return response.status(200).json({ order: results[0][0] });
      }
      return response.status(400).json({ error: "Ação inválida." });
    }
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Método não permitido." });
  } catch (error) {
    console.error("Falha no painel", error);
    return response.status(500).json({ error: "Não foi possível carregar ou atualizar o painel." });
  }
}
