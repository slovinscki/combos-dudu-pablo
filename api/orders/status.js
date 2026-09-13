import { getSql } from "../_db.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método não permitido." });
  }
  const orderId = String(request.query?.id ?? "");
  const publicToken = String(request.query?.token ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !/^[0-9a-f-]{36}$/i.test(publicToken)) return response.status(400).json({ error: "Identificação da compra inválida." });
  try {
    const sql = getSql();
    const [order] = await sql`SELECT id, merchant_slug, customer_name, total_cents, platform_fee_bps, platform_fee_cents, partner_balance_cents, payment_status, paid_at, purchase_date, status FROM combo_orders WHERE id = ${orderId} AND public_token = ${publicToken}`;
    if (!order) return response.status(404).json({ error: "Compra não encontrada." });
    const items = await sql`SELECT product_slug, product_name, unit_price_cents, platform_fee_cents, partner_balance_cents, valid_from, valid_until, allowed_weekdays, total_uses, used_uses FROM combo_order_items WHERE order_id = ${orderId} ORDER BY created_at`;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const expired = items.some((item) => item.valid_until && String(item.valid_until).slice(0, 10) < today && Number(item.used_uses) < Number(item.total_uses));
    const status = expired && !["cancelled", "used"].includes(order.status) ? "expired" : order.status;
    response.setHeader("Cache-Control", "private, no-store");
    return response.status(200).json({ order: { ...order, status }, items });
  } catch (error) {
    console.error("Falha ao consultar compra", error);
    return response.status(500).json({ error: "Não foi possível consultar a compra agora." });
  }
}
