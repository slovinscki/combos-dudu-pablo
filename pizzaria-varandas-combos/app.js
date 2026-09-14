const fallbackCombos = [
  { slug: "combo-casal", name: "Combo Casal ❤️", description: "1 Pizza Grande + Coca-Cola 2L. Exceto pizzas especiais. Pizzas sem borda.", priceCents: 9500, purchaseMode: "order", available: true },
  { slug: "combo-compartilhar", name: "Para Compartilhar 🍕🍺", description: "1 Pizza Grande + 4 Long Necks Corona. Exceto pizzas especiais. Pizzas sem borda.", priceCents: 12000, purchaseMode: "order", available: true },
  { slug: "combo-festa", name: "Combo Festa 🥳", description: "A partir de 6 pessoas. Rodízio de pizza + acompanhamentos. O jantar do aniversariante é por nossa conta.", priceCents: null, purchaseMode: "contact", available: true },
];

let combos = fallbackCombos;
const selected = new Set();
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const discountPercentage = 10;
const discountedPrice = (originalPrice) => originalPrice * (1 - discountPercentage / 100);
const discountedPriceCents = (originalPriceCents) => Math.round(discountedPrice(originalPriceCents));
const grid = document.querySelector("#combo-grid");
const list = document.querySelector("#selected-list");
const total = document.querySelector("#total-price");
const navCount = document.querySelector("#nav-count");
const status = document.querySelector("#selection-status");
const form = document.querySelector("#reservation-form");
const message = document.querySelector("#form-message");
const deliveryRules = document.querySelector("#delivery-rules");
const festaFields = document.querySelector("#festa-fields");
const submitButton = document.querySelector("#submit-order");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function chosenCombos() {
  return combos.filter((combo) => selected.has(combo.slug));
}

function renderCards() {
  grid.innerHTML = combos.map((combo) => {
    const active = selected.has(combo.slug);
    const price = combo.purchaseMode === "contact"
      ? '<span class="consult-price">Consultar / Reservar</span>'
      : `<span class="price-off">${discountPercentage}% OFF</span><span class="price-original">De <s>${money.format(combo.priceCents / 100)}</s></span><strong class="price-promotional">Por ${money.format(discountedPriceCents(combo.priceCents) / 100)}</strong>`;
    const action = combo.purchaseMode === "contact" ? "Consultar / Reservar" : "Escolher";
    return `<article class="combo-card ${active ? "selected" : ""} ${combo.available ? "" : "unavailable"}">
      <span class="limited">Oferta por tempo limitado</span>
      <div class="combo-content"><h3>${escapeHtml(combo.name)}</h3><p>${escapeHtml(combo.description)}</p><div class="price">${price}</div>
      <span class="availability">${combo.available ? "Disponível" : "Oferta encerrada"}</span>
      <button class="button card-button" type="button" data-id="${escapeHtml(combo.slug)}" aria-pressed="${active}" ${combo.available ? "" : "disabled"}>${active ? "Escolhido ✓" : action}</button></div>
    </article>`;
  }).join("");
}

function updateSelection() {
  const chosen = chosenCombos();
  const festaSelected = chosen.some((combo) => combo.purchaseMode === "contact");
  const totalCents = chosen.filter((combo) => Number.isInteger(combo.priceCents)).reduce((sum, combo) => sum + discountedPriceCents(combo.priceCents), 0);
  navCount.textContent = chosen.length;
  status.textContent = chosen.length ? `${chosen.length} ${chosen.length === 1 ? "combo selecionado" : "combos selecionados"}` : "Nenhum selecionado";
  total.textContent = festaSelected ? "Consulta / reserva" : chosen.length ? money.format(totalCents / 100) : "R$ —";
  list.innerHTML = chosen.length ? chosen.map((combo) => `<li><span>${escapeHtml(combo.name)}</span><strong>${combo.purchaseMode === "contact" ? "Consultar" : money.format(discountedPriceCents(combo.priceCents) / 100)}</strong></li>`).join("") : '<li class="empty-state">Clique em “Escolher” nos combos acima.</li>';
  deliveryRules.hidden = !chosen.some((combo) => combo.purchaseMode === "order");
  deliveryRules.querySelector("input").required = !deliveryRules.hidden;
  festaFields.hidden = !festaSelected;
  festaFields.querySelector("input[name=partySize]").required = festaSelected;
  submitButton.firstChild.textContent = festaSelected ? "Consultar / Reservar " : "Enviar pedido ";
  renderCards();
}

grid.addEventListener("click", (event) => {
  const slug = event.target.closest("[data-id]")?.dataset.id;
  if (!slug) return;
  const combo = combos.find((item) => item.slug === slug);
  if (!combo?.available) return;
  if (selected.has(slug)) selected.delete(slug);
  else if (combo.purchaseMode === "contact") { selected.clear(); selected.add(slug); }
  else { selected.delete("combo-festa"); selected.add(slug); }
  message.textContent = "";
  updateSelection();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const chosen = chosenCombos();
  if (!chosen.length) { message.textContent = "Escolha pelo menos um combo antes de enviar."; return; }
  if (!form.checkValidity()) { message.textContent = "Revise os campos obrigatórios e confirme as regras do combo."; form.reportValidity(); return; }
  const data = new FormData(form);
  const festaSelected = chosen.some((combo) => combo.purchaseMode === "contact");
  const payload = {
    merchantSlug: "pizzaria-varandas",
    productSlugs: [...selected],
    customer: { name: data.get("name"), phone: data.get("phone"), email: data.get("email") },
    acceptsDeliveryRestrictions: data.get("acceptsDeliveryRestrictions") === "on",
    partySize: festaSelected ? Number(data.get("partySize")) : null,
    desiredDate: data.get("desiredDate"),
    notes: data.get("notes"),
    marketingConsent: data.get("marketing") === "on",
  };
  submitButton.disabled = true;
  message.textContent = "Enviando…";
  try {
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível enviar agora.");
    message.textContent = result.type === "lead"
      ? "Recebemos sua solicitação do Combo Festa. A equipe entrará em contato para confirmar a reserva."
      : `Pedido ${result.orderId.slice(0, 8)} registrado por ${money.format(result.totalCents / 100)}. A equipe confirmará os detalhes pelo seu contato.`;
    selected.clear();
    form.reset();
    updateSelection();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

async function loadCatalog() {
  try {
    const response = await fetch("/api/products?merchant=pizzaria-varandas");
    if (!response.ok) throw new Error();
    const result = await response.json();
    if (!Array.isArray(result.products) || result.products.length !== 3) throw new Error();
    combos = result.products.map((product) => ({
      slug: product.slug,
      name: product.name,
      description: product.description,
      priceCents: product.price_cents == null ? null : Number(product.price_cents),
      purchaseMode: product.purchase_mode,
      available: product.available,
    }));
  } catch {
    message.textContent = "Não foi possível atualizar a disponibilidade agora. Confirme a oferta com a equipe.";
  }
  updateSelection();
}

loadCatalog();
