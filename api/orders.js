import { randomUUID } from "node:crypto";
import { getSql } from "./_db.js";
import { calculateDiscountedPriceCents, calculatePlatformSplit, calculateValidity } from "./_combo-rules.js";
import { createPixCopyPaste, pixConfigFromEnv } from "./_pix.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MERCHANTS = new Set(["fer-reinher", "pizzaria-varandas"]);
const PIZZERIA_DELIVERY_SLUGS = new Set(["combo-casal", "combo-compartilhar"]);
const PIZZERIA_DISCOUNT_PERCENTAGE = 10;

export function getFinalUnitPriceCents(merchantSlug, originalPriceCents) {
  const priceCents = Number(originalPriceCents);
  return merchantSlug === "pizzaria-varandas"
    ? calculateDiscountedPriceCents(priceCents, PIZZERIA_DISCOUNT_PERCENTAGE)
    : priceCents;
}

function parseBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body ?? {};
}

export function normalizeCustomer(customer = {}, { requireEmail = false } = {}) {
  const name = String(customer.name ?? "").trim().replace(/\s+/g, " ");
  const phone = String(customer.phone ?? "").trim();
  const email = String(customer.email ?? "").trim().toLowerCase();
  if (name.length < 3 || name.length > 120) throw new Error("Informe o nome completo.");
  if (phone.replace(/\D/g, "").length < 10 || phone.length > 30) throw new Error("Informe um telefone válido.");
  if (requireEmail && !email) throw new Error("Informe o e-mail.");
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 180)) throw new Error("Informe um e-mail válido.");
  return { name, phone, email: email || null };
}

export function classifyMicropigmentation(productSlugs, answer) {
  if (!productSlugs.includes("micropigmentacao")) return "order";
  if (typeof answer !== "boolean") throw new Error("Responda se já possui micropigmentação.");
  return answer ? "lead" : "order";
}

export function validatePizzeriaDelivery(productSlugs, acceptsRestrictions, pizzaSelections = []) {
  const hasDeliveryCombo = productSlugs.some((slug) => PIZZERIA_DELIVERY_SLUGS.has(slug));
  if (!hasDeliveryCombo) return;
  if (acceptsRestrictions !== true) throw new Error("Confirme as regras de pizzas não especiais e sem borda.");
  if (!Array.isArray(pizzaSelections)) throw new Error("Opções de pizza inválidas.");
  for (const selection of pizzaSelections) {
    const category = String(selection?.category ?? "").trim().toLowerCase();
    const crust = String(selection?.crust ?? "").trim().toLowerCase();
    if (selection?.isSpecial === true || category === "special" || category === "especial") throw new Error("Pizzas especiais não participam dos combos promocionais.");
    if (selection?.hasCrust === true || selection?.stuffedCrust === true || (crust && crust !== "none" && crust !== "sem borda")) throw new Error("Os combos promocionais incluem somente pizzas sem borda.");
  }
}

export function normalizePartySize(value) {
  const partySize = Number(value);
  if (!Number.isInteger(partySize) || partySize < 6 || partySize > 200) throw new Error("O Combo Festa é válido a partir de 6 pessoas.");
  return partySize;
}

function cleanText(value, maxLength) {
  const valueText = String(value ?? "").trim();
  return valueText ? valueText.slice(0, maxLength) : null;
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
    if (!ALLOWED_MERCHANTS.has(merchantSlug) || productSlugs.length < 1 || productSlugs.length > 3) return response.status(400).json({ error: "Seleção de combos inválida." });
    const customer = normalizeCustomer(body.customer, { requireEmail: merchantSlug === "fer-reinher" });

    const sql = getSql();
    const merchantProducts = await sql`SELECT id, slug, name, price_cents, entitlements, purchase_mode, rules, platform_fee_bps, validity_type, validity_days, validity_months, valid_from, valid_until, allowed_weekdays, total_uses, booking_instructions, active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) AS available FROM products WHERE merchant_slug = ${merchantSlug}`;
    const products = productSlugs.map((slug) => merchantProducts.find((product) => product.slug === slug));
    if (products.some((product) => !product)) return response.status(400).json({ error: "Um dos combos não existe." });
    if (products.some((product) => !product.available)) return response.status(409).json({ error: "Um dos combos selecionados não está mais disponível." });

    if (merchantSlug === "pizzaria-varandas") {
      const contactProducts = products.filter((product) => product.purchase_mode === "contact");
      if (contactProducts.length) {
        if (products.length !== 1 || contactProducts[0].slug !== "combo-festa") return response.status(400).json({ error: "O Combo Festa deve ser consultado separadamente dos combos de delivery." });
        let partySize;
        try { partySize = normalizePartySize(body.partySize); } catch (error) { return response.status(400).json({ error: error.message }); }
        const leadId = randomUUID();
        const metadata = { productSlugs, contactType: "reservation", partySize, desiredDate: cleanText(body.desiredDate, 40), notes: cleanText(body.notes, 500) };
        await sql`INSERT INTO combo_leads (id, merchant_slug, source_product_slug, name, phone, email, has_previous_micropigmentation, marketing_consent, status, metadata) VALUES (${leadId}, ${merchantSlug}, 'combo-festa', ${customer.name}, ${customer.phone}, ${customer.email}, false, ${Boolean(body.marketingConsent)}, 'new', ${JSON.stringify(metadata)}::jsonb)`;
        return response.status(202).json({ type: "lead", leadId });
      }
      try { validatePizzeriaDelivery(productSlugs, body.acceptsDeliveryRestrictions, body.pizzaSelections); } catch (error) { return response.status(400).json({ error: error.message }); }
    }

    if (products.some((product) => product.price_cents == null || !Number.isInteger(Number(product.price_cents)))) return response.status(400).json({ error: "Este combo precisa de consulta antes da reserva." });

    if (merchantSlug === "fer-reinher") {
      let flow;
      try { flow = classifyMicropigmentation(productSlugs, body.hasPreviousMicropigmentation); } catch (error) { return response.status(400).json({ error: error.message }); }
      if (flow === "lead") {
        const leadId = randomUUID();
        await sql`INSERT INTO combo_leads (id, merchant_slug, source_product_slug, name, phone, email, has_previous_micropigmentation, marketing_consent, status, metadata) VALUES (${leadId}, ${merchantSlug}, 'micropigmentacao', ${customer.name}, ${customer.phone}, ${customer.email}, true, ${Boolean(body.marketingConsent)}, 'new', ${JSON.stringify({ productSlugs })}::jsonb)`;
        return response.status(202).json({ type: "lead", leadId });
      }
    }

    const pricedProducts = products.map((product) => ({
      ...product,
      final_price_cents: getFinalUnitPriceCents(merchantSlug, product.price_cents),
    }));
    const includesMicropigmentation = productSlugs.includes("micropigmentacao");
    const orderId = randomUUID();
    const publicToken = randomUUID();
    const totalCents = pricedProducts.reduce((sum, product) => sum + product.final_price_cents, 0);
    const itemSnapshots = pricedProducts.map((product) => ({ product, ...calculatePlatformSplit(product.final_price_cents, Number(product.platform_fee_bps ?? 0)) }));
    const platformFeeCents = itemSnapshots.reduce((sum, item) => sum + item.platformFeeCents, 0);
    const partnerBalanceCents = totalCents - platformFeeCents;
    const [clock] = await sql`SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS purchase_date`;
    const purchaseDate = clock.purchase_date;
    let pixCopyPaste = null;
    if (merchantSlug === "fer-reinher") {
      try { pixCopyPaste = createPixCopyPaste({ ...pixConfigFromEnv(), amountCents: platformFeeCents, txid: orderId.replaceAll("-", "").slice(0, 25) }); }
      catch (error) { return response.status(503).json({ error: error.message }); }
    }

    const orderStatus = merchantSlug === "fer-reinher" ? "awaiting_pix" : "pending_confirmation";
    const paymentStatus = merchantSlug === "fer-reinher" ? "awaiting_pix" : "not_applicable";
    const platformFeeBps = merchantSlug === "fer-reinher" ? Number(products[0].platform_fee_bps) : 0;
    const queries = [sql`INSERT INTO combo_orders (id, merchant_slug, customer_name, customer_phone, customer_email, marketing_consent, has_previous_micropigmentation, total_cents, status, purchase_date, platform_fee_bps, platform_fee_cents, partner_balance_cents, payment_status, public_token) VALUES (${orderId}, ${merchantSlug}, ${customer.name}, ${customer.phone}, ${customer.email}, ${Boolean(body.marketingConsent)}, ${includesMicropigmentation ? false : null}, ${totalCents}, ${orderStatus}, ${purchaseDate}, ${platformFeeBps}, ${platformFeeCents}, ${partnerBalanceCents}, ${paymentStatus}, ${publicToken})`];
    for (const snapshot of itemSnapshots) {
      const { product } = snapshot;
      const validity = calculateValidity(product, purchaseDate);
      queries.push(sql`INSERT INTO combo_order_items (id, order_id, product_id, product_slug, product_name, unit_price_cents, quantity, platform_fee_bps, platform_fee_cents, partner_balance_cents, validity_type, valid_from, valid_until, allowed_weekdays, total_uses, used_uses) VALUES (${randomUUID()}, ${orderId}, ${product.id}, ${product.slug}, ${product.name}, ${product.final_price_cents}, 1, ${Number(product.platform_fee_bps ?? 0)}, ${snapshot.platformFeeCents}, ${snapshot.partnerBalanceCents}, ${product.validity_type ?? "none"}, ${validity.validFrom}, ${validity.validUntil}, ${product.allowed_weekdays ?? [0,1,2,3,4,5,6]}, ${Number(product.total_uses ?? 1)}, 0)`);
      const entitlements = Array.isArray(product.entitlements) ? product.entitlements : JSON.parse(product.entitlements || "[]");
      for (const entitlement of entitlements) queries.push(sql`INSERT INTO combo_entitlements (id, order_id, product_slug, service_code, service_name, total_units, used_units, status) VALUES (${randomUUID()}, ${orderId}, ${product.slug}, ${entitlement.code}, ${entitlement.name}, ${Number(entitlement.units)}, 0, 'pending')`);
    }
    await sql.transaction(queries);
    return response.status(201).json({ type: "order", orderId, publicToken, totalCents, platformFeeBps, platformFeeCents, partnerBalanceCents, paymentStatus, pixCopyPaste });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "Dados inválidos." });
    if (/Informe/.test(error.message)) return response.status(400).json({ error: error.message });
    console.error("Falha ao registrar solicitação", error);
    return response.status(500).json({ error: "Não foi possível registrar a solicitação agora." });
  }
}
