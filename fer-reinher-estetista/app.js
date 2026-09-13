const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const catalog = new Map([
  ["design-3", { name: "3 Designs", priceCents: 11400, platformFeeBps: 1500, validity: "Setembro a dezembro de 2026", totalUses: 3, available: true }],
  ["lash-design", { name: "Lash Lifting + Design", priceCents: 15000, platformFeeBps: 1500, validity: "30 dias corridos após a compra", totalUses: 1, available: true }],
  ["micropigmentacao", { name: "Micropigmentação de Sobrancelha", priceCents: 63000, platformFeeBps: 1500, validity: "2 meses-calendário após a compra", totalUses: 1, available: true }],
]);
const selected = new Set();
const form = document.querySelector("#order-form");
const question = document.querySelector("#micro-question");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-order");
const paymentResult = document.querySelector("#payment-result");
const paymentMessage = document.querySelector("#payment-message");
const confirmation = document.querySelector("#confirmation");
let pendingOrder = null;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const platformSplit = (totalCents, bps = 1500) => { const platformFeeCents = Math.round((totalCents * bps) / 10000); return { platformFeeCents, partnerBalanceCents: totalCents - platformFeeCents }; };

function selectedProducts() {
  return [...selected].map((slug) => ({ slug, ...catalog.get(slug) })).filter((product) => product.name);
}

function render() {
  for (const button of document.querySelectorAll(".choose-combo")) {
    const product = catalog.get(button.dataset.slug);
    const active = selected.has(button.dataset.slug);
    button.disabled = !product?.available;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
    button.innerHTML = active ? "Escolhido <span>✓</span>" : "Escolher <span>→</span>";
    const card = button.closest(".combo-card");
    card.classList.toggle("is-unavailable", !product?.available);
    card.querySelector(".availability-label").textContent = product?.available ? "Disponível" : "Oferta encerrada";
    card.querySelector(".price").textContent = money.format((product?.priceCents ?? 0) / 100);
  }
  const products = selectedProducts();
  const totalCents = products.reduce((sum, product) => sum + product.priceCents, 0);
  const platformFeeCents = products.reduce((sum, product) => sum + platformSplit(product.priceCents, product.platformFeeBps).platformFeeCents, 0);
  const list = document.querySelector("#selected-combos");
  list.innerHTML = products.length ? products.map((product) => `<li><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.validity)} · ${product.totalUses} ${product.totalUses === 1 ? "utilização" : "utilizações"}</small></span><strong>${money.format(product.priceCents / 100)}</strong></li>`).join("") : "<li>Nenhum combo escolhido.</li>";
  document.querySelector("#selection-count").textContent = String(products.length);
  document.querySelector("#total-value").textContent = money.format(totalCents / 100);
  document.querySelector("#platform-fee-value").textContent = money.format(platformFeeCents / 100);
  document.querySelector("#partner-balance-value").textContent = money.format((totalCents - platformFeeCents) / 100);
  question.hidden = !selected.has("micropigmentacao");
  if (question.hidden) form.elements.hasPreviousMicropigmentation.value = "";
  updateSubmitLabel();
}

function updateSubmitLabel() {
  const needsEvaluation = selected.has("micropigmentacao") && form.elements.hasPreviousMicropigmentation.value === "true";
  submitButton.innerHTML = needsEvaluation ? "Enviar para avaliação <span>→</span>" : "Gerar PIX da entrada <span>→</span>";
}

document.querySelectorAll(".choose-combo").forEach((button) => button.addEventListener("click", () => {
  if (button.disabled) return;
  selected.has(button.dataset.slug) ? selected.delete(button.dataset.slug) : selected.add(button.dataset.slug);
  message.textContent = "";
  paymentResult.hidden = true;
  confirmation.hidden = true;
  pendingOrder = null;
  render();
}));

form.addEventListener("change", updateSubmitLabel);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.className = "form-message";
  if (!selected.size) { message.textContent = "Escolha pelo menos um combo."; return; }
  if (!form.reportValidity()) return;
  const micropigmentationAnswer = form.elements.hasPreviousMicropigmentation.value;
  if (selected.has("micropigmentacao") && !micropigmentationAnswer) { message.textContent = "Responda à pergunta sobre micropigmentação para continuar."; question.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  const data = new FormData(form);
  const payload = {
    merchantSlug: "fer-reinher", productSlugs: [...selected],
    customer: { name: String(data.get("name") ?? ""), phone: String(data.get("phone") ?? ""), email: String(data.get("email") ?? "") },
    marketingConsent: data.get("marketingConsent") === "on",
    hasPreviousMicropigmentation: micropigmentationAnswer === "" ? null : micropigmentationAnswer === "true",
  };
  submitButton.disabled = true;
  message.textContent = "Preparando a entrada via PIX…";
  try {
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível registrar agora.");
    if (result.type === "lead") {
      message.className = "form-message success";
      message.textContent = "Como você já possui micropigmentação, a Fer avaliará suas sobrancelhas antes de um novo procedimento. Seu contato foi encaminhado para orientação.";
      selected.clear(); form.reset(); render(); return;
    }
    pendingOrder = { ...result, products: selectedProducts() };
    document.querySelector("#pix-amount").textContent = money.format(result.platformFeeCents / 100);
    document.querySelector("#pix-code").value = result.pixCopyPaste;
    paymentResult.hidden = false;
    paymentMessage.textContent = "Aguardando a confirmação do PIX.";
    message.textContent = "PIX gerado somente para a entrada de 15%.";
    paymentResult.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) { message.textContent = error.message; }
  finally { submitButton.disabled = Boolean(pendingOrder); }
});

document.querySelector("#copy-pix").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.querySelector("#pix-code").value);
  paymentMessage.textContent = "Código PIX copiado.";
});

document.querySelector("#check-payment").addEventListener("click", async () => {
  if (!pendingOrder) return;
  paymentMessage.textContent = "Verificando…";
  try {
    const response = await fetch(`/api/orders/status?id=${encodeURIComponent(pendingOrder.orderId)}&token=${encodeURIComponent(pendingOrder.publicToken)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível verificar agora.");
    if (result.order.payment_status !== "paid") { paymentMessage.textContent = "O PIX ainda não foi confirmado. Tente novamente em instantes."; return; }
    const items = result.items.map((item) => `<article><strong>${escapeHtml(item.product_name)}</strong><span>Valor do combo: ${money.format(item.unit_price_cents / 100)}</span><span>Entrada paga: ${money.format(item.platform_fee_cents / 100)}</span><span>Saldo com a profissional: ${money.format(item.partner_balance_cents / 100)}</span><span>Utilizações: ${item.total_uses - item.used_uses} de ${item.total_uses} disponíveis</span><span>Período: ${date.format(new Date(`${String(item.valid_from).slice(0, 10)}T00:00:00Z`))}${item.valid_until ? ` a ${date.format(new Date(`${String(item.valid_until).slice(0, 10)}T00:00:00Z`))}` : ""}</span><span>Agendamentos: terça a sexta-feira</span></article>`).join("");
    document.querySelector("#confirmation-details").innerHTML = items + "<p>A equipe da Fer enviará o canal de agendamento pelo contato informado.</p>";
    paymentResult.hidden = true; confirmation.hidden = false; pendingOrder = null; selected.clear(); form.reset(); render();
  } catch (error) { paymentMessage.textContent = error.message; }
});

async function syncAvailability() {
  try {
    const response = await fetch("/api/products?merchant=fer-reinher");
    if (!response.ok) return;
    const { products } = await response.json();
    for (const product of products) {
      if (!catalog.has(product.slug)) continue;
      const current = catalog.get(product.slug);
      catalog.set(product.slug, { ...current, name: product.name, priceCents: product.price_cents, platformFeeBps: product.platform_fee_bps, totalUses: product.total_uses, available: product.available });
      if (!product.available) selected.delete(product.slug);
    }
    render();
  } catch { /* A disponibilidade e os valores são validados novamente no servidor. */ }
}

render();
syncAvailability();
