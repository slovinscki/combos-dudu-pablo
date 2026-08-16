import { getSql } from "../_db.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método não permitido." });
  }

  const code = String(request.body?.code ?? "").trim().toUpperCase();
  const subtotalCents = Number(request.body?.subtotalCents);
  if (!code || !Number.isInteger(subtotalCents) || subtotalCents < 0) {
    return response.status(400).json({ valid: false, error: "Dados do cupom inválidos." });
  }

  try {
    const sql = getSql();
    const [coupon] = await sql`
      SELECT discount_type, discount_value, minimum_order_cents
      FROM coupons
      WHERE upper(code) = ${code}
        AND active = true
        AND (starts_at IS NULL OR starts_at <= now())
        AND (expires_at IS NULL OR expires_at > now())
        AND (max_uses IS NULL OR uses_count < max_uses)
      LIMIT 1
    `;

    if (!coupon || subtotalCents < coupon.minimum_order_cents) {
      return response.status(200).json({ valid: false });
    }

    const discountCents = coupon.discount_type === "percent"
      ? Math.floor(subtotalCents * coupon.discount_value / 100)
      : Math.min(subtotalCents, coupon.discount_value);
    return response.status(200).json({ valid: true, discountCents });
  } catch (error) {
    console.error("Falha ao validar cupom", error);
    return response.status(500).json({ valid: false, error: "Não foi possível validar o cupom." });
  }
}
