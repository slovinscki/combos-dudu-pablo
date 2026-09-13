const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
let token = sessionStorage.getItem("comboAdminToken") ?? "";
const login = document.querySelector("#login");
const dashboard = document.querySelector("#dashboard");
const globalMessage = document.querySelector("#global-message");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const formatDate = (value) => value ? dateOnly.format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`)) : "—";

async function api(options = {}) {
  const response = await fetch("/api/admin/dashboard", { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options.headers ?? {}) } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
  return result;
}
function statusSelect(kind, id, current, options) { return `<select data-kind="${kind}" data-id="${id}">${options.map(([value, label]) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`).join("")}</select>`; }
function appointmentMarkup(item, canSchedule) {
  const rows = (item.appointments ?? []).map((appointment) => `<div class="appointment"><span>${formatDate(appointment.scheduled_for)} · ${appointment.status === "completed" ? "utilizado" : appointment.status === "cancelled" ? "cancelado" : "agendado"}</span>${appointment.status === "scheduled" ? `<button data-action="complete-appointment" data-appointment-id="${appointment.id}">Marcar utilização</button>` : ""}</div>`).join("");
  const schedule = canSchedule && Number(item.used_uses) < Number(item.total_uses) ? `<div class="schedule"><input type="date" aria-label="Data do agendamento" data-date-for="${item.id}" min="${String(item.valid_from).slice(0, 10)}" max="${String(item.valid_until).slice(0, 10)}"/><button data-action="schedule" data-item-id="${item.id}">Agendar</button></div>` : "";
  return `${rows}${schedule}`;
}
function render({ products, leads, orders }) {
  document.querySelector("#products").innerHTML = products.map((product) => { const partner = product.merchant_slug === "pizzaria-varandas" ? "Pizzaria Varanda" : "Fer Reinher"; const price = product.price_cents == null ? "Consulta / reserva" : money.format(product.price_cents / 100); const fee = product.merchant_slug === "fer-reinher" ? ` · ${Number(product.platform_fee_bps) / 100}% ComboClub` : ""; return `<article class="card"><small>${partner}</small><h3>${escapeHtml(product.name)}</h3><p>${price}${fee}</p><button data-action="availability" data-merchant="${escapeHtml(product.merchant_slug)}" data-slug="${escapeHtml(product.slug)}" data-active="${product.active}">${product.active ? "Disponível · desativar" : "Indisponível · ativar"}</button></article>`; }).join("");
  document.querySelector("#leads").innerHTML = leads.length ? leads.map((lead) => { const festa = lead.merchant_slug === "pizzaria-varandas" && lead.source_product_slug === "combo-festa"; const origin = festa ? "Pizzaria Varanda · Combo Festa" : "Fer Reinher · Combo Micropigmentação"; const details = festa ? `${escapeHtml(lead.metadata?.partySize ?? "—")} pessoas${lead.metadata?.desiredDate ? `<small>Data desejada: ${escapeHtml(lead.metadata.desiredDate)}</small>` : ""}${lead.metadata?.notes ? `<small>${escapeHtml(lead.metadata.notes)}</small>` : ""}` : "Já possui micropigmentação"; return `<tr><td><strong>${escapeHtml(lead.name)}</strong><small>${escapeHtml(lead.phone)}${lead.email ? ` · ${escapeHtml(lead.email)}` : ""}</small></td><td>${origin}</td><td>${details}</td><td>${dateTime.format(new Date(lead.created_at))}</td><td>${statusSelect("lead", lead.id, lead.status, [["new","Novo"],["contacted","Contatado"],["evaluated","Avaliado"],["closed","Encerrado"]])}</td></tr>`; }).join("") : '<tr><td colspan="5">Nenhum lead ou reserva recebido.</td></tr>';
  document.querySelector("#orders").innerHTML = orders.length ? orders.map((order) => {
    const isFer = order.merchant_slug === "fer-reinher"; const partner = isFer ? "Fer Reinher" : "Pizzaria Varanda"; const items = order.items ?? [];
    const itemNames = items.map((item) => `<strong>${escapeHtml(item.product_name)}</strong>`).join("");
    const validities = items.map((item) => `<div><strong>${escapeHtml(item.product_name)}</strong><small>${formatDate(item.valid_from)} a ${formatDate(item.valid_until)}</small></div>`).join("") || "—";
    const uses = items.map((item) => `<div class="usage"><strong>${item.used_uses} de ${item.total_uses} utilizado${Number(item.used_uses) === 1 ? "" : "s"}</strong>${appointmentMarkup(item, isFer && order.payment_status === "paid" && !["cancelled","expired","used"].includes(order.status))}</div>`).join("") || "—";
    const values = isFer ? `<span>Total: ${money.format(order.total_cents / 100)}</span><span>ComboClub (${Number(order.platform_fee_bps) / 100}%): ${money.format(order.platform_fee_cents / 100)}</span><span>Saldo Fer: ${money.format(order.partner_balance_cents / 100)}</span>` : `<span>Total: ${money.format(order.total_cents / 100)}</span>`;
    const statusOptions = isFer ? [["awaiting_pix","Aguardando PIX"],["paid","Pago"],["cancelled","Cancelado"]] : [["pending_confirmation","A confirmar"],["confirmed","Confirmado"],["cancelled","Cancelado"]];
    const current = statusOptions.some(([value]) => value === order.status) ? order.status : (order.payment_status === "paid" ? "paid" : order.status);
    return `<tr><td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_phone)}</small><small>${escapeHtml(order.customer_email || "Sem e-mail")}</small></td><td><span>${partner}</span>${itemNames}</td><td class="money-stack">${values}</td><td><span>${dateTime.format(new Date(order.created_at))}</span>${validities}</td><td>${uses}</td><td>${statusSelect("order", order.id, current, statusOptions)}<small>${escapeHtml(order.status)}</small></td></tr>`;
  }).join("") : '<tr><td colspan="6">Nenhum pedido recebido.</td></tr>';
}
async function load() { try { render(await api()); login.hidden = true; dashboard.hidden = false; document.querySelector("#refresh").hidden = false; document.querySelector("#login-message").textContent = ""; } catch (error) { login.hidden = false; dashboard.hidden = true; document.querySelector("#refresh").hidden = true; document.querySelector("#login-message").textContent = error.message; } }
async function update(body) { globalMessage.textContent = "Salvando…"; try { await api({ method: "POST", body: JSON.stringify(body) }); globalMessage.textContent = "Atualização salva."; await load(); } catch (error) { globalMessage.textContent = error.message; } setTimeout(() => { globalMessage.textContent = ""; }, 3500); }
document.querySelector("#login-form").addEventListener("submit", (event) => { event.preventDefault(); token = document.querySelector("#token").value; sessionStorage.setItem("comboAdminToken", token); load(); });
document.querySelector("#refresh").addEventListener("click", load);
document.querySelector("#products").addEventListener("click", (event) => { const button = event.target.closest("[data-action=availability]"); if (button) update({ action: "set_product_availability", merchantSlug: button.dataset.merchant, slug: button.dataset.slug, active: button.dataset.active !== "true" }); });
document.querySelector("#leads").addEventListener("change", (event) => { if (event.target.dataset.kind === "lead") update({ action: "set_lead_status", id: event.target.dataset.id, status: event.target.value }); });
document.querySelector("#orders").addEventListener("change", (event) => { if (event.target.dataset.kind === "order") update({ action: "set_order_status", id: event.target.dataset.id, status: event.target.value }); });
document.querySelector("#orders").addEventListener("click", (event) => { const button = event.target.closest("button[data-action]"); if (!button) return; if (button.dataset.action === "schedule") { const input = document.querySelector(`[data-date-for="${button.dataset.itemId}"]`); if (!input.value) { globalMessage.textContent = "Escolha a data do agendamento."; return; } update({ action: "schedule_appointment", itemId: button.dataset.itemId, date: input.value }); } if (button.dataset.action === "complete-appointment") update({ action: "complete_appointment", appointmentId: button.dataset.appointmentId }); });
if (token) load();
