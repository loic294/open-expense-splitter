import type { D1Database } from "../../platform/sql-adapter";
import { createId } from "../utils/id";

export async function fetchHistoricalRateFromProvider(
  date: string,
  baseCurrency: string,
  targetCurrency: string,
): Promise<number> {
  const url = `https://api.frankfurter.app/${encodeURIComponent(date)}?from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(targetCurrency)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`FX provider error ${response.status}`);
  const payload = (await response.json()) as {
    rates?: Record<string, number>;
  };
  const rate = payload.rates?.[targetCurrency];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0)
    throw new Error("FX provider returned invalid rate");
  return rate;
}

export async function getOrFetchRate(
  db: D1Database,
  date: string,
  baseCurrency: string,
  targetCurrency: string,
): Promise<number> {
  if (baseCurrency === targetCurrency) return 1;
  const cached = await db
    .prepare(
      `SELECT rate FROM exchange_rates
       WHERE rate_date = ? AND base_currency = ? AND target_currency = ?
       LIMIT 1`,
    )
    .bind(date, baseCurrency, targetCurrency)
    .first<{ rate: number }>();
  if (cached?.rate && Number.isFinite(cached.rate) && cached.rate > 0)
    return cached.rate;

  const rate = await fetchHistoricalRateFromProvider(
    date,
    baseCurrency,
    targetCurrency,
  );
  await db
    .prepare(
      `INSERT INTO exchange_rates (id, rate_date, base_currency, target_currency, rate)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(rate_date, base_currency, target_currency)
       DO UPDATE SET rate = excluded.rate, fetched_at = CURRENT_TIMESTAMP`,
    )
    .bind(`fx_${createId()}`, date, baseCurrency, targetCurrency, rate)
    .run();
  return rate;
}
