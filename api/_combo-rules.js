const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function calculatePlatformSplit(totalCents, platformFeeBps) {
  if (!Number.isInteger(totalCents) || totalCents < 0) throw new Error("Valor total inválido.");
  if (!Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > 10000) throw new Error("Percentual da plataforma inválido.");
  const platformFeeCents = Math.round((totalCents * platformFeeBps) / 10000);
  return { platformFeeCents, partnerBalanceCents: totalCents - platformFeeCents };
}

function parseDate(date) {
  if (!DATE_PATTERN.test(String(date))) throw new Error("Data inválida.");
  const [year, month, day] = String(date).split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error("Data inválida.");
  return parsed;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(date, days) {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + Number(days));
  return formatDate(parsed);
}

export function addCalendarMonths(date, months) {
  const parsed = parseDate(date);
  const originalDay = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + Number(months));
  const lastDay = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
  parsed.setUTCDate(Math.min(originalDay, lastDay));
  return formatDate(parsed);
}

export function calculateValidity(product, purchaseDate) {
  parseDate(purchaseDate);
  const validityType = String(product.validity_type ?? "none");
  if (validityType === "fixed_period") {
    if (!product.valid_from || !product.valid_until) throw new Error("Período de utilização não configurado.");
    return { validFrom: String(product.valid_from).slice(0, 10), validUntil: String(product.valid_until).slice(0, 10) };
  }
  if (validityType === "days") return { validFrom: purchaseDate, validUntil: addCalendarDays(purchaseDate, Number(product.validity_days)) };
  if (validityType === "months") return { validFrom: purchaseDate, validUntil: addCalendarMonths(purchaseDate, Number(product.validity_months)) };
  return { validFrom: purchaseDate, validUntil: null };
}

export function validateAppointmentDate(date, { validFrom, validUntil, allowedWeekdays }) {
  const parsed = parseDate(date);
  if (validFrom && date < String(validFrom).slice(0, 10)) throw new Error("Este combo ainda não está dentro do período de utilização.");
  if (validUntil && date > String(validUntil).slice(0, 10)) throw new Error("Este combo está vencido e não pode mais ser agendado.");
  const weekdays = Array.isArray(allowedWeekdays) ? allowedWeekdays.map(Number) : [];
  if (weekdays.length && !weekdays.includes(parsed.getUTCDay())) throw new Error("Os combos da Fer Reinher podem ser agendados somente de terça a sexta-feira.");
  return true;
}
