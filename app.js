const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function renderPrice(card, priceCents) {
  const match = money.format(priceCents / 100).match(/R\$\s*(\d+)(?:[.,](\d{2}))?/);
  if (!match) return;
  card.querySelector(".priceBlock small").textContent = "R$";
  card.querySelector(".priceBlock strong").textContent = match[1];
  card.querySelector(".priceBlock sup").textContent = `,${match[2] ?? "00"}`;
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) return;
    const { products } = await response.json();

    for (const product of products) {
      const card = [...document.querySelectorAll(".comboCard")]
        .find((item) => item.querySelector("h3")?.textContent === product.name);
      if (!card) continue;
      card.querySelector("h3").textContent = product.name;
      card.querySelector(":scope > p").textContent = product.description ?? "";
      renderPrice(card, product.price_cents);
    }
  } catch {
    // O HTML permanece funcional se a API estiver temporariamente indisponível.
  }
}

loadProducts();
