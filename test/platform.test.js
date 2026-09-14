import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classifyMicropigmentation, getFinalUnitPriceCents, normalizeCustomer, normalizePartySize, validatePizzeriaDelivery } from "../api/orders.js";
import { addCalendarMonths, calculateDiscountedPriceCents, calculatePlatformSplit, calculateValidity, validateAppointmentDate } from "../api/_combo-rules.js";
import { createPixCopyPaste } from "../api/_pix.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("as três abas públicas estão ligadas entre si", () => {
  for (const path of ["index.html", "pizzaria-varandas-combos/index.html", "fer-reinher-estetista/index.html"]) {
    const html = read(path);
    assert.match(html, /href="\/"/);
    assert.match(html, /href="\/pizzaria-varandas-combos\/"/);
    assert.match(html, /href="\/fer-reinher-estetista\/"/);
  }
});

test("a oferta da Fer contém os valores e a pergunta obrigatória", () => {
  const html = read("fer-reinher-estetista/index.html");
  assert.match(html, /R\$ 114,00/);
  assert.match(html, /R\$ 150,00/);
  assert.match(html, /R\$ 630,00/);
  assert.match(html, /Você já possui micropigmentação nas sobrancelhas\?/);
});

test("a Pizzaria Varanda exibe os três combos oficiais e as restrições", () => {
  for (const path of ["pizzaria-varandas-combos/index.html", "pizzaria-varandas-combos/menores/index.html"]) {
    const html = read(path);
    assert.match(html, /Pizzaria Varanda/);
    assert.doesNotMatch(html, /Pizzaria Varandas/);
    assert.match(html, /não especiais|não especial/i);
    assert.match(html, /sem borda/i);
  }
  const app = read("pizzaria-varandas-combos/app.js");
  assert.match(app, /9500/);
  assert.match(app, /12000/);
  assert.match(app, /Combo Festa/);
  assert.match(app, /priceCents: null/);
  assert.doesNotMatch(app, /priceCents: 0/);
});

test("a política de micropigmentação não pode ser contornada no backend", () => {
  assert.throws(() => classifyMicropigmentation(["micropigmentacao"], undefined), /Responda/);
  assert.equal(classifyMicropigmentation(["micropigmentacao"], true), "lead");
  assert.equal(classifyMicropigmentation(["micropigmentacao"], false), "order");
  assert.equal(classifyMicropigmentation(["design-3"], undefined), "order");
});

test("os dados mínimos do cliente são normalizados e validados", () => {
  assert.deepEqual(normalizeCustomer({ name: "  Maria   Silva ", phone: "(51) 99999-0000", email: "MARIA@EXEMPLO.COM" }), { name: "Maria Silva", phone: "(51) 99999-0000", email: "maria@exemplo.com" });
  assert.throws(() => normalizeCustomer({ name: "A", phone: "1" }), /nome completo/);
});

test("a entrada da Fer é calculada em centavos a partir de 15%", () => {
  assert.deepEqual(calculatePlatformSplit(11400, 1500), { platformFeeCents: 1710, partnerBalanceCents: 9690 });
  assert.deepEqual(calculatePlatformSplit(15000, 1500), { platformFeeCents: 2250, partnerBalanceCents: 12750 });
  assert.deepEqual(calculatePlatformSplit(63000, 1500), { platformFeeCents: 9450, partnerBalanceCents: 53550 });
});

test("os combos com preço da Pizzaria Varanda recebem exatamente 10% de desconto", () => {
  assert.equal(calculateDiscountedPriceCents(9500, 10), 8550);
  assert.equal(calculateDiscountedPriceCents(12000, 10), 10800);
  assert.equal(getFinalUnitPriceCents("pizzaria-varandas", 9500), 8550);
  assert.equal(getFinalUnitPriceCents("pizzaria-varandas", 12000), 10800);
  assert.equal(getFinalUnitPriceCents("fer-reinher", 11400), 11400);
  for (const path of ["pizzaria-varandas-combos/app.js", "pizzaria-varandas-combos/menores/vibe.js"]) {
    const app = read(path);
    assert.match(app, /const discountPercentage = 10/);
    assert.match(app, /price-original/);
    assert.match(app, /price-promotional/);
    assert.match(app, /discountedPriceCents\(combo\.priceCents\)/);
  }
  const orders = read("api/orders.js");
  assert.match(orders, /merchantSlug === "pizzaria-varandas"[\s\S]*?calculateDiscountedPriceCents/);
  assert.match(orders, /unit_price_cents[\s\S]*?product\.final_price_cents/);
});

test("as validades usam dias e meses-calendário", () => {
  assert.deepEqual(calculateValidity({ validity_type: "days", validity_days: 30 }, "2026-09-15"), { validFrom: "2026-09-15", validUntil: "2026-10-15" });
  assert.deepEqual(calculateValidity({ validity_type: "months", validity_months: 2 }, "2026-09-15"), { validFrom: "2026-09-15", validUntil: "2026-11-15" });
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
});

test("agendamento da Fer aceita terça a sexta e rejeita vencimento e outros dias", () => {
  const rules = { validFrom: "2026-09-01", validUntil: "2026-12-31", allowedWeekdays: [2, 3, 4, 5] };
  assert.doesNotThrow(() => validateAppointmentDate("2026-09-15", rules));
  assert.throws(() => validateAppointmentDate("2026-09-14", rules), /terça a sexta/);
  assert.throws(() => validateAppointmentDate("2027-01-05", rules), /vencido/);
});

test("o PIX copia e cola contém exatamente o valor da entrada", () => {
  const pix = createPixCopyPaste({ key: "teste@example.com", merchantName: "ComboClub", merchantCity: "Agudo", amountCents: 9450, txid: "PEDIDO123" });
  assert.match(pix, /540594\.50/);
  assert.doesNotMatch(pix, /630\.00/);
  assert.match(pix, /6304[0-9A-F]{4}$/);
});

test("as regras de pizza especial e borda são obrigatórias no backend", () => {
  assert.throws(() => validatePizzeriaDelivery(["combo-casal"], false), /Confirme as regras/);
  assert.throws(() => validatePizzeriaDelivery(["combo-casal"], true, [{ isSpecial: true }]), /especiais/);
  assert.throws(() => validatePizzeriaDelivery(["combo-compartilhar"], true, [{ hasCrust: true }]), /sem borda/);
  assert.doesNotThrow(() => validatePizzeriaDelivery(["combo-casal"], true, [{ category: "tradicional", crust: "sem borda" }]));
});

test("o Combo Festa exige seis pessoas e não usa preço zero", () => {
  assert.equal(normalizePartySize("6"), 6);
  assert.throws(() => normalizePartySize(5), /a partir de 6/);
  assert.throws(() => normalizePartySize("6.5"), /a partir de 6/);
  const sql = read("migrations/002_pizzaria_varanda_combos.sql");
  assert.match(sql, /'combo-festa'[\s\S]*?NULL[\s\S]*?'contact'/);
  assert.match(sql, /'combo-casal'[\s\S]*?9500/);
  assert.match(sql, /'combo-compartilhar'[\s\S]*?12000/);
});

test("a migration preserva pedidos, créditos e leads em tabelas próprias", () => {
  const sql = read("migrations/001_unified_combo_platform.sql");
  for (const table of ["combo_orders", "combo_order_items", "combo_entitlements", "combo_leads"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql, /products_merchant_slug_slug_key/);
});

test("a nova migration configura apenas a Fer e preserva snapshots financeiros", () => {
  const sql = read("migrations/003_fer_payment_validity_and_usage.sql");
  assert.match(sql, /platform_fee_bps = 1500/);
  assert.match(sql, /ARRAY\[2,3,4,5\]/);
  assert.match(sql, /DATE '2026-09-01'/);
  assert.match(sql, /DATE '2026-12-31'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS combo_appointments/);
  assert.match(sql, /appointment_id uuid NOT NULL UNIQUE/);
  assert.doesNotMatch(sql, /WHERE merchant_slug = 'pizzaria-varandas'/);
});

test("as páginas não referenciam PNG ou JPEG", () => {
  const files = ["index.html", "style.css", "pizzaria-varandas-combos/index.html", "pizzaria-varandas-combos/styles.css", "pizzaria-varandas-combos/menores/index.html", "pizzaria-varandas-combos/menores/vibe.css", "fer-reinher-estetista/index.html", "fer-reinher-estetista/style.css"];
  for (const path of files) assert.doesNotMatch(read(path), /\.(png|jpe?g)/i, path);
});
