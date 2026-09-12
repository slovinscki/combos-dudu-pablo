import { timingSafeEqual } from "node:crypto";

export function requireAdmin(request, response) {
  const configured = process.env.ADMIN_TOKEN ?? "";
  const supplied = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!configured) {
    response.status(503).json({ error: "Painel ainda não configurado." });
    return false;
  }
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  const valid = expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
  if (!valid) {
    response.status(401).json({ error: "Acesso não autorizado." });
    return false;
  }
  return true;
}
