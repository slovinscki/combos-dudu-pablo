const combos = [
  { id: 'varandas-1', name: 'Combo Varandas 01', priceCents: null, note: 'Itens, sabores, preço e condições: a confirmar.' },
  { id: 'varandas-2', name: 'Combo Varandas 02', priceCents: null, note: 'Itens, sabores, preço e condições: a confirmar.' },
  { id: 'varandas-3', name: 'Combo Varandas 03', priceCents: null, note: 'Itens, sabores, preço e condições: a confirmar.' },
];

const selected = new Set();
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const grid = document.querySelector('#combo-grid');
const list = document.querySelector('#selected-list');
const total = document.querySelector('#total-price');
const navCount = document.querySelector('#nav-count');
const status = document.querySelector('#selection-status');

function renderCards() {
  grid.innerHTML = combos.map(combo => `
    <article class="combo-card ${selected.has(combo.id) ? 'selected' : ''}">
      <div class="combo-content"><h3>${combo.name}</h3><p>${combo.note}</p><span class="price">A confirmar</span>
      <button class="button card-button" type="button" data-id="${combo.id}" aria-pressed="${selected.has(combo.id)}">${selected.has(combo.id) ? 'Escolhido ✓' : 'Escolher'}</button></div>
    </article>`).join('');
}
function updateSelection() {
  const chosen = combos.filter(combo => selected.has(combo.id));
  const hasPendingPrice = chosen.some(combo => !Number.isInteger(combo.priceCents));
  const totalCents = chosen.reduce((sum, combo) => sum + (combo.priceCents || 0), 0);
  navCount.textContent = chosen.length;
  status.textContent = chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'combo' : 'combos'} selecionado${chosen.length === 1 ? '' : 's'}` : 'Nenhum selecionado';
  total.textContent = chosen.length && !hasPendingPrice ? money.format(totalCents / 100) : 'A confirmar';
  list.innerHTML = chosen.length ? chosen.map(combo => `<li><span>${combo.name}</span><strong>${Number.isInteger(combo.priceCents) ? money.format(combo.priceCents / 100) : 'A confirmar'}</strong></li>`).join('') : '<li class="empty-state">Clique em “Escolher” nos combos acima.</li>';
  renderCards();
}
grid.addEventListener('click', event => { const id = event.target.dataset.id; if (!id) return; selected.has(id) ? selected.delete(id) : selected.add(id); updateSelection(); });
document.querySelector('#reservation-form').addEventListener('submit', event => { event.preventDefault(); const message = document.querySelector('#form-message'); if (!selected.size) { message.textContent = 'Escolha pelo menos um combo antes de enviar a pré-reserva.'; return; } if (!event.currentTarget.checkValidity()) { message.textContent = 'Preencha nome, telefone e e-mail para continuar.'; event.currentTarget.reportValidity(); return; } message.textContent = 'Pré-reserva pronta para integração com o canal oficial da Pizzaria Varandas.'; });
renderCards();
