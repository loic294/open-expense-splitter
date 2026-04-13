import { Hono } from "hono";
import type { HonoCtx, RouteDeps } from "../types";
import { requireAuth, isUnauthorizedError } from "../utils/auth";
import { normalizeCurrency, SUPPORTED_CURRENCIES } from "../utils/currency";
import { getOrFetchRate } from "../db/exchangeRates";

export function createExchangeRatesRouter({ db }: RouteDeps) {
  const router = new Hono<HonoCtx>();

  router.post("/api/exchange-rates/resolve", async (c) => {
    try {
      requireAuth(c);
      const body = await c.req.json<{
        baseCurrency?: string;
        targetCurrency?: string;
        dates?: string[];
      }>();
      const baseCurrency = normalizeCurrency(body.baseCurrency);
      const targetCurrency = normalizeCurrency(body.targetCurrency);
      const dates = Array.from(
        new Set(
          (Array.isArray(body.dates) ? body.dates : [])
            .filter((d): d is string => typeof d === "string")
            .map((d) => d.slice(0, 10)),
        ),
      ).slice(0, 366);

      const ratesByDate: Record<string, number> = {};
      for (const date of dates) {
        ratesByDate[date] = await getOrFetchRate(
          db,
          date,
          baseCurrency,
          targetCurrency,
        );
      }
      return c.json({
        baseCurrency,
        targetCurrency,
        ratesByDate,
        supportedCurrencies: SUPPORTED_CURRENCIES,
      });
    } catch (err) {
      console.error("[POST /api/exchange-rates/resolve] Error:", {
        baseCurrency: body.baseCurrency,
        targetCurrency: body.targetCurrency,
        error: err,
      });
      return c.json(
        {
          error: isUnauthorizedError(err)
            ? "Unauthorized"
            : "Internal Server Error",
        },
        isUnauthorizedError(err) ? 401 : 500,
      );
    }
  });

  return router;
}
