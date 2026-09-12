const fallbackCombos = [
  { slug: "combo-casal", name: "COMBO CASAL ❤️", description: "1 Pizza Grande + Coca-Cola 2L. Exceto pizzas especiais. Pizzas sem borda.", priceCents: 9500, purchaseMode: "order", available: true },
  { slug: "combo-compartilhar", name: "PARA COMPARTILHAR 🍕🍺", description: "1 Pizza Grande + 4 Long Necks Corona. Exceto pizzas especiais. Pizzas sem borda.", priceCents: 12000, purchaseMode: "order", available: true },
  { slug: "combo-festa", name: "COMBO FESTA 🥳", description: "A partir de 6 pessoas. Rodízio + acompanhamentos. Jantar do aniversariante por nossa conta.", priceCents: null, purchaseMode: "contact", available: true },
];
let combos = fallbackCombos;
const selected = new Set();
const grid = document.querySelector("#combo-grid");
const form = document.querySelector("#reservation-form");
const output = document.querySelector("#form-message");
const deliveryRules = document.querySelector("#delivery-rules");
const festaFields = document.querySelector("#festa-fields");
const submitButton = document.querySelector("#submit-order");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function chosenCombos() { return combos.filter((combo) => selected.has(combo.slug)); }

function render() {
  grid.innerHTML = combos.map((combo) => {
    const active = selected.has(combo.slug);
    const price = combo.purchaseMode === "contact" ? "CONSULTAR / RESERVAR" : money.format(combo.priceCents / 100);
    return `<article class="combo ${active ? "selected" : ""} ${combo.available ? "" : "unavailable"}"><span class="limited">Oferta por tempo limitado</span><div class="combo-content"><h3>${escapeHtml(combo.name)}</h3><p>${escapeHtml(combo.description)}</p><span class="price">${price}</span><span class="availability">${combo.available ? "DISPONÍVEL" : "OFERTA ENCERRADA"}</span><button class="pick" type="button" data-id="${escapeHtml(combo.slug)}" aria-pressed="${active}" ${combo.available ? "" : "disabled"}>${active ? "ESCOLHIDO ✓" : combo.purchaseMode === "contact" ? "CONSULTAR / RESERVAR" : "ESCOLHER"}</button></div></article>`;
  }).join("");
  const chosen = chosenCombos();
  const festaSelected = chosen.some((combo) => combo.purchaseMode === "contact");
  const cents = chosen.filter((combo) => Number.isInteger(combo.priceCents)).reduce((sum, combo) => sum + combo.priceCents, 0);
  document.querySelector("#nav-count").textContent = chosen.length;
  document.querySelector("#selection-status").textContent = `${chosen.length} ${chosen.length === 1 ? "combo" : "combos"}`;
  document.querySelector("#total-price").textContent = festaSelected ? "CONSULTA / RESERVA" : chosen.length ? money.format(cents / 100) : "R$ —";
  document.querySelector("#selected-list").innerHTML = chosen.length ? chosen.map((combo) => `<li><span>${escapeHtml(combo.name)}</span><b>${combo.purchaseMode === "contact" ? "CONSULTAR" : money.format(combo.priceCents / 100)}</b></li>`).join("") : '<li class="empty">Escolhe um combo ali em cima ✦</li>';
  deliveryRules.hidden = !chosen.some((combo) => combo.purchaseMode === "order");
  deliveryRules.querySelector("input").required = !deliveryRules.hidden;
  festaFields.hidden = !festaSelected;
  festaFields.querySelector("input[name=partySize]").required = festaSelected;
  submitButton.firstChild.textContent = festaSelected ? "CONSULTAR / RESERVAR " : "ENVIAR PEDIDO ";
}

grid.addEventListener("click", (event) => {
  const slug = event.target.closest("[data-id]")?.dataset.id;
  if (!slug) return;
  const combo = combos.find((item) => item.slug === slug);
  if (!combo?.available) return;
  if (selected.has(slug)) selected.delete(slug);
  else if (combo.purchaseMode === "contact") { selected.clear(); selected.add(slug); }
  else { selected.delete("combo-festa"); selected.add(slug); }
  output.textContent = "";
  render();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const chosen = chosenCombos();
  if (!chosen.length) { output.textContent = "Escolhe pelo menos um combo antes de enviar."; return; }
  if (!form.checkValidity()) { output.textContent = "Revise os campos e confirme as regras do combo."; form.reportValidity(); return; }
  const data = new FormData(form);
  const festaSelected = chosen.some((combo) => combo.purchaseMode === "contact");
  submitButton.disabled = true;
  output.textContent = "ENVIANDO…";
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchantSlug: "pizzaria-varandas",
        productSlugs: [...selected],
        customer: { name: data.get("name"), phone: data.get("phone"), email: data.get("email") },
        acceptsDeliveryRestrictions: data.get("acceptsDeliveryRestrictions") === "on",
        partySize: festaSelected ? Number(data.get("partySize")) : null,
        desiredDate: data.get("desiredDate"),
        notes: data.get("notes"),
        marketingConsent: data.get("marketing") === "on",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível enviar agora.");
    output.textContent = result.type === "lead" ? "PEDIDO DE RESERVA RECEBIDO! A EQUIPE VAI ENTRAR EM CONTATO." : `PEDIDO ${result.orderId.slice(0, 8)} REGISTRADO POR ${money.format(result.totalCents / 100)}.`;
    selected.clear(); form.reset(); render();
  } catch (error) { output.textContent = error.message; }
  finally { submitButton.disabled = false; }
});

async function loadCatalog() {
  try {
    const response = await fetch("/api/products?merchant=pizzaria-varandas");
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (!Array.isArray(result.products) || result.products.length !== 3) throw new Error();
    combos = result.products.map((product) => ({ slug: product.slug, name: product.name.toUpperCase(), description: product.description, priceCents: product.price_cents == null ? null : Number(product.price_cents), purchaseMode: product.purchase_mode, available: product.available }));
  } catch { output.textContent = "Não foi possível atualizar a disponibilidade. Confirme a oferta com a equipe."; }
  render();
}
loadCatalog();
