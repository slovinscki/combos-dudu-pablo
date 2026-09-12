import { randomUUID } from "node:crypto";
import { getSql } from "./_db.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body ?? {};
}

export function normalizeCustomer(customer = {}) {
  const name = String(customer.name ?? "").trim().replace(/\s+/g, " ");
  const phone = String(customer.phone ?? "").trim();
  const email = String(customer.email ?? "").trim().toLowerCase();
  if (name.length < 3 || name.length > 120) throw new Error("Informe o nome completo.");
  if (phone.replace(/\D/g, "").length < 10 || phone.length > 30) throw new Error("Informe um telefone válido.");
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 180)) throw new Error("Informe um e-mail válido.");
  return { name, phone, email: email || null };
}

export function classifyMicropigmentation(productSlugs, answer) {
  if (!productSlugs.includes("micropigmentacao")) return "order";
  if (typeof answer !== "boolean") throw new Error("Responda se já possui micropigmentação.");
  return answer ? "lead" : "order";
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método não permitido." });
  }
  try {
    const body = parseBody(request);
    const merchantSlug = String(body.merchantSlug ?? "").trim().toLowerCase();
    const productSlugs = [...new Set(Array.isArray(body.productSlugs) ? body.productSlugs.map(String) : [])];
    const customer = normalizeCustomer(body.customer);
    if (merchantSlug !== "fer-reinher" || productSlugs.length < 1 || productSlugs.length > 3) return response.status(400).json({ error: "Seleção de combos inválida." });

    const sql = getSql();
    const merchantProducts = await sql`SELECT id, slug, name, price_cents, entitlements, active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) AS available FROM products WHERE merchant_slug = ${merchantSlug}`;
    const products = productSlugs.map((slug) => merchantProducts.find((product) => product.slug === slug));
    if (products.some((product) => !product)) return response.status(400).json({ error: "Um dos combos não existe." });
    if (products.some((product) => !product.available)) return response.status(409).json({ error: "Um dos combos selecionados não está mais disponível." });

    const includesMicropigmentation = productSlugs.includes("micropigmentacao");
    let flow;
    try { flow = classifyMicropigmentation(productSlugs, body.hasPreviousMicropigmentation); }
    catch (error) { return response.status(400).json({ error: error.message }); }

    if (flow === "lead") {
      const leadId = randomUUID();
      await sql`INSERT INTO combo_leads (id, merchant_slug, source_product_slug, name, phone, email, has_previous_micropigmentation, marketing_consent, status, metadata) VALUES (${leadId}, ${merchantSlug}, 'micropigmentacao', ${customer.name}, ${customer.phone}, ${customer.email}, true, ${Boolean(body.marketingConsent)}, 'new', ${JSON.stringify({ productSlugs })}::jsonb)`;
      return response.status(202).json({ type: "lead", leadId });
    }

    const orderId = randomUUID();
    const totalCents = products.reduce((sum, product) => sum + Number(product.price_cents), 0);
    const queries = [sql`INSERT INTO combo_orders (id, merchant_slug, customer_name, customer_phone, customer_email, marketing_consent, has_previous_micropigmentation, total_cents, status) VALUES (${orderId}, ${merchantSlug}, ${customer.name}, ${customer.phone}, ${customer.email}, ${Boolean(body.marketingConsent)}, ${includesMicropigmentation ? false : null}, ${totalCents}, 'pending_confirmation')`];
    for (const product of products) {
      queries.push(sql`INSERT INTO combo_order_items (id, order_id, product_id, product_slug, product_name, unit_price_cents, quantity) VALUES (${randomUUID()}, ${orderId}, ${product.id}, ${product.slug}, ${product.name}, ${product.price_cents}, 1)`);
      const entitlements = Array.isArray(product.entitlements) ? product.entitlements : JSON.parse(product.entitlements || "[]");
      for (const entitlement of entitlements) {
        queries.push(sql`INSERT INTO combo_entitlements (id, order_id, product_slug, service_code, service_name, total_units, used_units, status) VALUES (${randomUUID()}, ${orderId}, ${product.slug}, ${entitlement.code}, ${entitlement.name}, ${Number(entitlement.units)}, 0, 'pending')`);
      }
    }
    await sql.transaction(queries);
    return response.status(201).json({ type: "order", orderId, totalCents, status: "pending_confirmation" });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "Dados inválidos." });
    if (/Informe/.test(error.message)) return response.status(400).json({ error: error.message });
    console.error("Falha ao registrar solicitação", error);
    return response.status(500).json({ error: "Não foi possível registrar a solicitação agora." });
  }
}
