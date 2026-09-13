import { randomUUID } from "node:crypto";
import { getSql } from "../_db.js";
import { requireAdmin } from "../_auth.js";
import { validateAppointmentDate } from "../_combo-rules.js";

function parseBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body ?? {};
}

async function dashboardData(sql) {
  const [products, leads, orders, items, appointments] = await Promise.all([
    sql`SELECT id, merchant_slug, slug, name, price_cents, purchase_mode, platform_fee_bps, validity_type, validity_days, validity_months, valid_from, valid_until, allowed_weekdays, total_uses, active, starts_at, ends_at FROM products WHERE merchant_slug IN ('fer-reinher', 'pizzaria-varandas') ORDER BY merchant_slug, sort_order`,
    sql`SELECT id, merchant_slug, name, phone, email, source_product_slug, has_previous_micropigmentation, status, metadata, created_at FROM combo_leads WHERE merchant_slug IN ('fer-reinher', 'pizzaria-varandas') ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT id, merchant_slug, customer_name, customer_phone, customer_email, total_cents, platform_fee_bps, platform_fee_cents, partner_balance_cents, payment_status, paid_at, purchase_date, status, created_at FROM combo_orders WHERE merchant_slug IN ('fer-reinher', 'pizzaria-varandas') ORDER BY created_at DESC LIMIT 100`,
    sql`SELECT item.id, item.order_id, item.product_slug, item.product_name, item.unit_price_cents, item.platform_fee_bps, item.platform_fee_cents, item.partner_balance_cents, item.valid_from, item.valid_until, item.allowed_weekdays, item.total_uses, item.used_uses FROM combo_order_items item JOIN combo_orders orders ON orders.id = item.order_id WHERE orders.merchant_slug IN ('fer-reinher', 'pizzaria-varandas') ORDER BY item.created_at`,
    sql`SELECT appointment.id, appointment.order_item_id, appointment.scheduled_for, appointment.status FROM combo_appointments appointment JOIN combo_order_items item ON item.id = appointment.order_item_id JOIN combo_orders orders ON orders.id = item.order_id WHERE orders.merchant_slug = 'fer-reinher' ORDER BY appointment.scheduled_for`,
  ]);
  const itemsByOrder = new Map();
  for (const item of items) {
    item.appointments = appointments.filter((appointment) => appointment.order_item_id === item.id);
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  }
  return { products, leads, orders: orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] })) };
}

async function expireFerOrders(sql) {
  await sql`UPDATE combo_orders orders SET status = 'expired', updated_at = now() WHERE orders.merchant_slug = 'fer-reinher' AND orders.status NOT IN ('used', 'cancelled', 'expired') AND EXISTS (SELECT 1 FROM combo_order_items item WHERE item.order_id = orders.id AND item.valid_until < (now() AT TIME ZONE 'America/Sao_Paulo')::date AND item.used_uses < item.total_uses)`;
}

async function updateOrderProgress(sql, orderId) {
  await sql`UPDATE combo_orders orders SET status = CASE WHEN summary.remaining = 0 THEN 'used' WHEN summary.used > 0 THEN 'partially_used' ELSE 'paid' END, updated_at = now() FROM (SELECT order_id, sum(total_uses - used_uses)::int AS remaining, sum(used_uses)::int AS used FROM combo_order_items WHERE order_id = ${orderId} GROUP BY order_id) summary WHERE orders.id = summary.order_id AND orders.payment_status = 'paid' AND orders.status <> 'cancelled'`;
}

export default async function handler(request, response) {
  if (!requireAdmin(request, response)) return;
  const sql = getSql();
  try {
    if (request.method === "GET") {
      await expireFerOrders(sql);
      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json(await dashboardData(sql));
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      return response.status(405).json({ error: "Método não permitido." });
    }
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
      if (!["new", "contacted", "evaluated", "closed"].includes(body.status)) return response.status(400).json({ error: "Status inválido." });
      const [lead] = await sql`UPDATE combo_leads SET status = ${body.status}, updated_at = now() WHERE id = ${String(body.id)} RETURNING id, status`;
      if (!lead) return response.status(404).json({ error: "Lead não encontrado." });
      return response.status(200).json({ lead });
    }
    if (body.action === "set_order_status") {
      const [current] = await sql`SELECT id, merchant_slug, status FROM combo_orders WHERE id = ${String(body.id)}`;
      if (!current) return response.status(404).json({ error: "Pedido não encontrado." });
      const allowed = current.merchant_slug === "fer-reinher" ? ["awaiting_pix", "paid", "cancelled"] : ["pending_confirmation", "confirmed", "cancelled"];
      if (!allowed.includes(body.status)) return response.status(400).json({ error: "Status inválido." });
      const paymentStatus = current.merchant_slug === "fer-reinher" ? (body.status === "paid" ? "paid" : body.status === "cancelled" ? "cancelled" : "awaiting_pix") : "not_applicable";
      const entitlementStatus = ["paid", "confirmed"].includes(body.status) ? "available" : body.status === "cancelled" ? "cancelled" : "pending";
      const results = await sql.transaction([
        sql`UPDATE combo_orders SET status = ${body.status}, payment_status = ${paymentStatus}, paid_at = CASE WHEN ${body.status} = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END, updated_at = now() WHERE id = ${current.id} RETURNING id, status, payment_status`,
        sql`UPDATE combo_entitlements SET status = ${entitlementStatus}, updated_at = now() WHERE order_id = ${current.id} AND used_units = 0`,
      ]);
      return response.status(200).json({ order: results[0][0] });
    }
    if (body.action === "schedule_appointment") {
      const itemId = String(body.itemId ?? "");
      const appointmentDate = String(body.date ?? "");
      const [item] = await sql`SELECT item.id, item.valid_from, item.valid_until, item.allowed_weekdays, item.total_uses, item.used_uses, orders.id AS order_id, orders.merchant_slug, orders.payment_status, orders.status FROM combo_order_items item JOIN combo_orders orders ON orders.id = item.order_id WHERE item.id = ${itemId}`;
      if (!item || item.merchant_slug !== "fer-reinher") return response.status(404).json({ error: "Utilização não encontrada." });
      if (item.payment_status !== "paid" || ["cancelled", "expired"].includes(item.status)) return response.status(409).json({ error: "O combo precisa estar pago e dentro da validade para ser agendado." });
      if (Number(item.used_uses) >= Number(item.total_uses)) return response.status(409).json({ error: "Todas as utilizações deste combo já foram consumidas." });
      try { validateAppointmentDate(appointmentDate, { validFrom: item.valid_from, validUntil: item.valid_until, allowedWeekdays: item.allowed_weekdays }); }
      catch (error) { return response.status(400).json({ error: error.message }); }
      const [appointment] = await sql`INSERT INTO combo_appointments (id, order_item_id, scheduled_for, status) SELECT ${randomUUID()}, ${item.id}, ${appointmentDate}, 'scheduled' WHERE (SELECT count(*) FROM combo_appointments WHERE order_item_id = ${item.id} AND status = 'scheduled') < ${Number(item.total_uses) - Number(item.used_uses)} ON CONFLICT DO NOTHING RETURNING id, order_item_id, scheduled_for, status`;
      if (!appointment) return response.status(409).json({ error: "Não há utilização livre para essa data ou ela já foi agendada." });
      return response.status(201).json({ appointment });
    }
    if (body.action === "complete_appointment") {
      const appointmentId = String(body.appointmentId ?? "");
      const [result] = await sql`WITH candidate AS (SELECT id, order_item_id FROM combo_appointments WHERE id = ${appointmentId} AND status = 'scheduled'), updated AS (UPDATE combo_order_items item SET used_uses = used_uses + 1 FROM candidate WHERE item.id = candidate.order_item_id AND item.used_uses < item.total_uses RETURNING item.id, item.order_id, item.used_uses, item.total_uses), completed AS (UPDATE combo_appointments appointment SET status = 'completed', updated_at = now() FROM updated WHERE appointment.id = ${appointmentId} AND appointment.order_item_id = updated.id RETURNING appointment.id, appointment.order_item_id), event AS (INSERT INTO combo_usage_events (id, appointment_id, order_item_id) SELECT ${randomUUID()}, id, order_item_id FROM completed ON CONFLICT (appointment_id) DO NOTHING) SELECT * FROM updated`;
      if (!result) {
        const [existing] = await sql`SELECT id, status FROM combo_appointments WHERE id = ${appointmentId}`;
        if (existing?.status === "completed") return response.status(200).json({ appointment: existing, idempotent: true });
        return response.status(409).json({ error: "Agendamento não encontrado ou utilização indisponível." });
      }
      await updateOrderProgress(sql, result.order_id);
      return response.status(200).json({ item: result });
    }
    return response.status(400).json({ error: "Ação inválida." });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "Dados inválidos." });
    console.error("Falha no painel", error);
    return response.status(500).json({ error: "Não foi possível carregar ou atualizar o painel." });
  }
}
