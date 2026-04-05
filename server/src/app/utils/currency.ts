export const DEFAULT_CURRENCY = "USD";
export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "CNY",
  "INR",
  "BRL",
  "MXN",
] as const;

export function normalizeCurrency(raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return SUPPORTED_CURRENCIES.includes(
    value as (typeof SUPPORTED_CURRENCIES)[number],
  )
    ? value
    : DEFAULT_CURRENCY;
}
