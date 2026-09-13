function field(id, value) {
  const text = String(value);
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

function crc16(payload) {
  let crc = 0xffff;
  for (const character of payload) {
    crc ^= character.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function pixText(value, maxLength) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .-]/g, "").trim().toUpperCase().slice(0, maxLength);
}

export function createPixCopyPaste({ key, merchantName, merchantCity, amountCents, txid }) {
  if (!key || !merchantName || !merchantCity) throw new Error("PIX ainda não configurado para o ComboClub.");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Valor PIX inválido.");
  const account = field("00", "BR.GOV.BCB.PIX") + field("01", String(key).trim());
  const additional = field("05", pixText(txid, 25) || "***");
  const base = field("00", "01") + field("26", account) + field("52", "0000") + field("53", "986") + field("54", (amountCents / 100).toFixed(2)) + field("58", "BR") + field("59", pixText(merchantName, 25)) + field("60", pixText(merchantCity, 15)) + field("62", additional) + "6304";
  return base + crc16(base);
}

export function pixConfigFromEnv(env = process.env) {
  return { key: env.PIX_KEY, merchantName: env.PIX_MERCHANT_NAME, merchantCity: env.PIX_MERCHANT_CITY };
}
