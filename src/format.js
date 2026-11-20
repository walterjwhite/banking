export function money(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function signed(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);
  return `${value < 0 ? "−" : "+"}${money(Math.abs(value))}`;
}

export function percent(rate) {
  const value = Number(rate);
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
}
