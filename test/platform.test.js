import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classifyMicropigmentation, normalizeCustomer, normalizePartySize, validatePizzeriaDelivery } from "../api/orders.js";

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

test("as páginas não referenciam PNG ou JPEG", () => {
  const files = ["index.html", "style.css", "pizzaria-varandas-combos/index.html", "pizzaria-varandas-combos/styles.css", "pizzaria-varandas-combos/menores/index.html", "pizzaria-varandas-combos/menores/vibe.css", "fer-reinher-estetista/index.html", "fer-reinher-estetista/style.css"];
  for (const path of files) assert.doesNotMatch(read(path), /\.(png|jpe?g)/i, path);
});
