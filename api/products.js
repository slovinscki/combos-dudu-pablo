import { getSql } from "./_db.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método não permitido." });
  }

  try {
    const sql = getSql();
    const products = await sql`
      SELECT id, name, description, price_cents, image_url
      FROM products
      WHERE active = true
      ORDER BY price_cents DESC
    `;

    response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json({ products });
  } catch (error) {
    console.error("Falha ao consultar produtos", error);
    return response.status(500).json({ error: "Não foi possível carregar os combos." });
  }
}
