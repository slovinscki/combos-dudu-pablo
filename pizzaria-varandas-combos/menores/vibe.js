const combos = [
  { id: 'vibe-1', name: 'COMBO VIBE 01', priceCents: null, note: 'Itens, sabores, preço e condições: a confirmar.' },
  { id: 'vibe-2', name: 'COMBO VIBE 02', priceCents: null, note: 'Itens, sabores, preço e condições: a confirmar.' },
  { id: 'vibe-3', name: 'COMBO VIBE 03', priceCents: null, note: 'Itens, sabores, preço e condições: a confirmar.' },
];
const selected = new Set();
const grid = document.querySelector('#combo-grid');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function render() {
  grid.innerHTML = combos.map(c => `<article class="combo ${selected.has(c.id) ? 'selected' : ''}"><div class="combo-content"><h3>${c.name}</h3><p>${c.note}</p><span class="price">A CONFIRMAR</span><button class="pick" type="button" data-id="${c.id}" aria-pressed="${selected.has(c.id)}">${selected.has(c.id) ? 'ESCOLHIDO ✓' : 'ESCOLHER'}</button></div></article>`).join('');
  const chosen = combos.filter(c => selected.has(c.id));
  const pending = chosen.some(c => !Number.isInteger(c.priceCents));
  const cents = chosen.reduce((sum, c) => sum + (c.priceCents || 0), 0);
  document.querySelector('#nav-count').textContent = chosen.length;
  document.querySelector('#selection-status').textContent = `${chosen.length} ${chosen.length === 1 ? 'combo' : 'combos'}`;
  document.querySelector('#total-price').textContent = chosen.length && !pending ? money.format(cents / 100) : 'A confirmar';
  document.querySelector('#selected-list').innerHTML = chosen.length ? chosen.map(c => `<li><span>${c.name}</span><b>${Number.isInteger(c.priceCents) ? money.format(c.priceCents / 100) : 'A confirmar'}</b></li>`).join('') : '<li class="empty">Escolhe um combo ali em cima ✦</li>';
}
grid.addEventListener('click', e => { const id = e.target.dataset.id; if (!id) return; selected.has(id) ? selected.delete(id) : selected.add(id); render(); });
document.querySelector('#reservation-form').addEventListener('submit', e => { e.preventDefault(); const form = e.currentTarget, output = document.querySelector('#form-message'); if (!selected.size) { output.textContent = 'Escolhe pelo menos um combo antes de enviar.'; return; } if (!form.checkValidity()) { output.textContent = 'Preenche nome, telefone e e-mail para continuar.'; form.reportValidity(); return; } output.textContent = 'Pré-reserva pronta para integrar ao canal oficial da Varandas.'; });
render();
