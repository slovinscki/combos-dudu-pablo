const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
let token = sessionStorage.getItem("comboAdminToken") ?? "";
const login = document.querySelector("#login");
const dashboard = document.querySelector("#dashboard");
const globalMessage = document.querySelector("#global-message");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

async function api(options = {}) {
  const response = await fetch("/api/admin/dashboard", { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
  return result;
}

function statusSelect(kind, id, current, options) {
  return `<select data-kind="${kind}" data-id="${id}">${options.map(([value, label]) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`).join("")}</select>`;
}

function render({ products, leads, orders }) {
  document.querySelector("#products").innerHTML = products.map((product) => `<article class="card"><h3>${escapeHtml(product.name)}</h3><p>${money.format(product.price_cents / 100)}</p><button data-action="availability" data-slug="${escapeHtml(product.slug)}" data-active="${product.active}">${product.active ? "Disponível · desativar" : "Indisponível · ativar"}</button></article>`).join("");
  document.querySelector("#leads").innerHTML = leads.length ? leads.map((lead) => `<tr><td><strong>${escapeHtml(lead.name)}</strong><small>${escapeHtml(lead.phone)}${lead.email ? ` · ${escapeHtml(lead.email)}` : ""}</small></td><td>Combo Micropigmentação<small>Já possui micropigmentação</small></td><td>${dateTime.format(new Date(lead.created_at))}</td><td>${statusSelect("lead", lead.id, lead.status, [["new","Novo"],["contacted","Contatado"],["evaluated","Avaliado"],["closed","Encerrado"]])}</td></tr>`).join("") : '<tr><td colspan="4">Nenhum lead recebido.</td></tr>';
  document.querySelector("#orders").innerHTML = orders.length ? orders.map((order) => {
    const entitlements = Array.isArray(order.entitlements) ? order.entitlements : [];
    const credits = entitlements.map((item) => `${escapeHtml(item.serviceName)}: ${item.usedUnits}/${item.totalUnits}`).join("<br>") || "—";
    return `<tr><td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_phone)}${order.customer_email ? ` · ${escapeHtml(order.customer_email)}` : ""}</small></td><td>${money.format(order.total_cents / 100)}</td><td>${credits}</td><td>${dateTime.format(new Date(order.created_at))}</td><td>${statusSelect("order", order.id, order.status, [["pending_confirmation","A confirmar"],["confirmed","Confirmado"],["cancelled","Cancelado"]])}</td></tr>`;
  }).join("") : '<tr><td colspan="5">Nenhum pedido recebido.</td></tr>';
}

async function load() {
  try {
    render(await api()); login.hidden = true; dashboard.hidden = false; document.querySelector("#refresh").hidden = false; document.querySelector("#login-message").textContent = "";
  } catch (error) {
    login.hidden = false; dashboard.hidden = true; document.querySelector("#refresh").hidden = true; document.querySelector("#login-message").textContent = error.message;
  }
}

async function update(body) {
  globalMessage.textContent = "Salvando…";
  try { await api({ method: "POST", body: JSON.stringify(body) }); globalMessage.textContent = "Atualização salva."; await load(); }
  catch (error) { globalMessage.textContent = error.message; }
  setTimeout(() => { globalMessage.textContent = ""; }, 3500);
}

document.querySelector("#login-form").addEventListener("submit", (event) => { event.preventDefault(); token = document.querySelector("#token").value; sessionStorage.setItem("comboAdminToken", token); load(); });
document.querySelector("#refresh").addEventListener("click", load);
document.querySelector("#products").addEventListener("click", (event) => { const button = event.target.closest("[data-action=availability]"); if (button) update({ action: "set_product_availability", slug: button.dataset.slug, active: button.dataset.active !== "true" }); });
document.querySelector("#leads").addEventListener("change", (event) => { if (event.target.dataset.kind === "lead") update({ action: "set_lead_status", id: event.target.dataset.id, status: event.target.value }); });
document.querySelector("#orders").addEventListener("change", (event) => { if (event.target.dataset.kind === "order") update({ action: "set_order_status", id: event.target.dataset.id, status: event.target.value }); });
if (token) load();
