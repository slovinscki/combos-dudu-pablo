const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const catalog = new Map([
  ["design-3", { name: "3 Designs de Sobrancelha", priceCents: 11400, available: true }],
  ["lash-design", { name: "Lash Lifting + Design", priceCents: 15000, available: true }],
  ["micropigmentacao", { name: "Micropigmentação de Sobrancelha", priceCents: 63000, available: true }],
]);
const selected = new Set();
const form = document.querySelector("#order-form");
const question = document.querySelector("#micro-question");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-order");
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

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
  const products = [...selected].map((slug) => catalog.get(slug)).filter(Boolean);
  const list = document.querySelector("#selected-combos");
  list.innerHTML = products.length
    ? products.map((product) => `<li><span>${escapeHtml(product.name)}</span><strong>${money.format(product.priceCents / 100)}</strong></li>`).join("")
    : "<li>Nenhum combo escolhido.</li>";
  document.querySelector("#selection-count").textContent = String(products.length);
  document.querySelector("#total-value").textContent = money.format(products.reduce((sum, product) => sum + product.priceCents, 0) / 100);
  question.hidden = !selected.has("micropigmentacao");
  if (question.hidden) form.elements.hasPreviousMicropigmentation.value = "";
  updateSubmitLabel();
}

function updateSubmitLabel() {
  const needsEvaluation = selected.has("micropigmentacao") && form.elements.hasPreviousMicropigmentation.value === "true";
  submitButton.innerHTML = needsEvaluation ? "Enviar para avaliação <span>→</span>" : "Registrar solicitação <span>→</span>";
}

document.querySelectorAll(".choose-combo").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    selected.has(button.dataset.slug) ? selected.delete(button.dataset.slug) : selected.add(button.dataset.slug);
    message.textContent = "";
    render();
  });
});

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
    merchantSlug: "fer-reinher",
    productSlugs: [...selected],
    customer: { name: String(data.get("name") ?? ""), phone: String(data.get("phone") ?? ""), email: String(data.get("email") ?? "") },
    marketingConsent: data.get("marketingConsent") === "on",
    hasPreviousMicropigmentation: micropigmentationAnswer === "" ? null : micropigmentationAnswer === "true",
  };
  submitButton.disabled = true;
  message.textContent = "Registrando…";
  try {
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível registrar agora.");
    message.className = "form-message success";
    message.textContent = result.type === "lead"
      ? "Como você já possui micropigmentação, a Fer avaliará suas sobrancelhas antes de um novo procedimento. Seu contato foi encaminhado para orientação."
      : `Solicitação ${result.orderId.slice(0, 8)} registrada. A equipe confirmará o pedido pelo seu contato.`;
    selected.clear();
    form.reset();
    render();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

async function syncAvailability() {
  try {
    const response = await fetch("/api/products?merchant=fer-reinher");
    if (!response.ok) return;
    const { products } = await response.json();
    for (const product of products) {
      if (!catalog.has(product.slug)) continue;
      catalog.set(product.slug, { name: product.name, priceCents: product.price_cents, available: product.available });
      if (!product.available) selected.delete(product.slug);
    }
    render();
  } catch {
    // A validação final de disponibilidade também ocorre no servidor.
  }
}

render();
syncAvailability();
