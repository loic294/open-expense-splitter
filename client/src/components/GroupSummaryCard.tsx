import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useApiCall } from "../api";
import { useNavbarActionsTarget } from "../context/NavbarActionsContext";
import type { Group, GroupMember, Transaction } from "../types";
import {
  buildGroupExpenseSummary,
  currencyLabel,
  exchangeRateCacheKey,
  getDateInputValue,
  memberName,
  normalizeCurrency,
  normalizeSupportedCurrencies,
  SUPPORTED_CURRENCIES,
  createReimbursementSplitData,
  normalizeTransaction,
} from "../utils/spending";

function memberInitial(member: GroupMember) {
  const label = memberName(member).trim();
  return label ? label[0].toUpperCase() : "U";
}

function MemberIdentity({ member }: { member: GroupMember }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="avatar">
        <span className="w-6 rounded-full bg-base-200 text-[10px] font-medium text-base-content/70 flex items-center justify-center overflow-hidden">
          {member.picture ? (
            <img src={member.picture} alt={memberName(member)} />
          ) : (
            memberInitial(member)
          )}
        </span>
      </span>
      <span>{memberName(member)}</span>
    </span>
  );
}

interface Props {
  group: Group;
  transactions: Transaction[];
  onReimbursementRecorded: (transaction: Transaction) => void;
}

export default function GroupSummaryCard({
  group,
  transactions,
  onReimbursementRecorded,
}: Props) {
  const apiCall = useApiCall();
  const navbarTarget = useNavbarActionsTarget();
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>([
    ...SUPPORTED_CURRENCIES,
  ]);
  const [loadingCurrencyPreference, setLoadingCurrencyPreference] =
    useState(false);
  const [savingCurrencyPreference, setSavingCurrencyPreference] =
    useState(false);
  const [resolvingRates, setResolvingRates] = useState(false);
  const [exchangeRateCache, setExchangeRateCache] = useState<
    Record<string, number>
  >({});

  // Load currency preference for this group
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoadingCurrencyPreference(true);
        const response = await apiCall(
          `/api/batches/${group.id}/currency-preference`,
        );
        if (cancelled) return;
        setDisplayCurrency(normalizeCurrency(response.currency));
        const next = normalizeSupportedCurrencies(response.supportedCurrencies);
        if (next.length > 0) setSupportedCurrencies(next);
      } catch (error) {
        console.error("Failed to fetch currency preference:", error);
      } finally {
        if (!cancelled) setLoadingCurrencyPreference(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [group.id, apiCall]);

  // Resolve missing exchange rates
  useEffect(() => {
    if (transactions.length === 0) return;
    const missingByBase = new Map<string, Set<string>>();
    transactions.forEach((t) => {
      const src = normalizeCurrency(t.currency);
      if (src === displayCurrency) return;
      const date = getDateInputValue(t.transactionDate);
      const key = exchangeRateCacheKey(date, src, displayCurrency);
      if (exchangeRateCache[key]) return;
      const existing = missingByBase.get(src) || new Set<string>();
      existing.add(date);
      missingByBase.set(src, existing);
    });
    if (missingByBase.size === 0) return;

    let cancelled = false;
    const resolve = async () => {
      try {
        setResolvingRates(true);
        const responses = await Promise.all(
          Array.from(missingByBase.entries()).map(([base, dates]) =>
            apiCall("/api/exchange-rates/resolve", {
              method: "POST",
              body: JSON.stringify({
                baseCurrency: base,
                targetCurrency: displayCurrency,
                dates: Array.from(dates),
              }),
            }),
          ),
        );
        if (cancelled) return;
        const nextRates: Record<string, number> = {};
        responses.forEach((r) => {
          const base = normalizeCurrency(r.baseCurrency);
          const target = normalizeCurrency(r.targetCurrency);
          const next = normalizeSupportedCurrencies(r.supportedCurrencies);
          if (next.length > 0) setSupportedCurrencies(next);
          const ratesByDate =
            r.ratesByDate && typeof r.ratesByDate === "object"
              ? (r.ratesByDate as Record<string, number>)
              : {};
          Object.entries(ratesByDate).forEach(([date, rate]) => {
            if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
              nextRates[exchangeRateCacheKey(date, base, target)] = rate;
            }
          });
        });
        if (Object.keys(nextRates).length > 0) {
          setExchangeRateCache((prev) => ({ ...prev, ...nextRates }));
        }
      } catch (error) {
        console.error("Failed to resolve exchange rates:", error);
      } finally {
        if (!cancelled) setResolvingRates(false);
      }
    };
    resolve();
    return () => {
      cancelled = true;
    };
  }, [group.id, transactions, displayCurrency, exchangeRateCache, apiCall]);

  const displayAmounts = useMemo(() => {
    const out: Record<string, number> = {};
    transactions.forEach((t) => {
      const amount = Number(t.amount || 0);
      const src = normalizeCurrency(t.currency);
      if (src === displayCurrency) {
        out[t.id] = amount;
        return;
      }
      const date = getDateInputValue(t.transactionDate);
      const rate =
        exchangeRateCache[exchangeRateCacheKey(date, src, displayCurrency)];
      out[t.id] =
        typeof rate === "number" && Number.isFinite(rate) && rate > 0
          ? amount * rate
          : amount;
    });
    return out;
  }, [transactions, displayCurrency, exchangeRateCache]);

  const summary = useMemo(
    () =>
      buildGroupExpenseSummary(
        group.members,
        transactions,
        (t) => displayAmounts[t.id] ?? Number(t.amount || 0),
      ),
    [group.members, transactions, displayAmounts],
  );

  const memberById = useMemo(
    () => new Map(group.members.map((m) => [m.id, m])),
    [group.members],
  );

  const updateDisplayCurrency = async (next: string) => {
    const currency = normalizeCurrency(next);
    setDisplayCurrency(currency);
    try {
      setSavingCurrencyPreference(true);
      const response = await apiCall(
        `/api/batches/${group.id}/currency-preference`,
        { method: "PUT", body: JSON.stringify({ currency }) },
      );
      setDisplayCurrency(normalizeCurrency(response.currency));
      const supported = normalizeSupportedCurrencies(
        response.supportedCurrencies,
      );
      if (supported.length > 0) setSupportedCurrencies(supported);
    } catch (error) {
      console.error("Failed to update currency preference:", error);
    } finally {
      setSavingCurrencyPreference(false);
    }
  };

  const recordReimbursement = async (
    fromMemberId: string,
    toMemberId: string,
    amount: number,
  ) => {
    const memberIds = group.members.map((m) => m.id);
    const t: Transaction = {
      id: `draft_${Date.now()}`,
      batchId: group.id,
      amount: -amount,
      currency: displayCurrency,
      name: "Reimbursement",
      description: "",
      transactionDate: getDateInputValue(),
      category: "",
      paidById: fromMemberId,
      splitType: "percent",
      splitData: createReimbursementSplitData(
        memberIds,
        fromMemberId,
        toMemberId,
      ),
    };
    try {
      const response = await apiCall("/api/spendings", {
        method: "POST",
        body: JSON.stringify({
          batchId: t.batchId,
          amount: t.amount,
          currency: t.currency,
          name: t.name,
          description: t.description,
          transactionDate: t.transactionDate,
          category: t.category,
          paidById: t.paidById,
          splitType: t.splitType,
          splitData: t.splitData,
        }),
      });
      if (response.spending) {
        onReimbursementRecorded(normalizeTransaction(response.spending, group));
      }
    } catch (error) {
      console.error("[reimbursement] failed", error);
    }
  };

  return (
    <>
      {navbarTarget &&
        createPortal(
          <div className="flex items-center gap-2">
            {resolvingRates && (
              <span className="text-xs text-base-content/60">
                Loading FX rates…
              </span>
            )}
            <select
              className="select select-xs"
              value={displayCurrency}
              disabled={loadingCurrencyPreference || savingCurrencyPreference}
              onChange={(e) => updateDisplayCurrency(e.target.value)}
            >
              {supportedCurrencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>,
          navbarTarget,
        )}
      <section className="card card-border rounded-md bg-base-100 w-full shadow-sm">
        <div className="card-body gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="card-title text-base">Group summary</h2>
            <span className="badge badge-soft badge-primary">
              Total: {currencyLabel(summary.totalExpenses, displayCurrency)}
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {group.members.map((member) => {
              const balance = summary.balances.find(
                (b) => b.memberId === member.id,
              );
              const net = balance?.net ?? 0;
              const tone =
                net > 0.01
                  ? "text-success"
                  : net < -0.01
                    ? "text-warning"
                    : "text-base-content/70";
              return (
                <div
                  key={member.id}
                  className="rounded-md border border-base-300 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <MemberIdentity member={member} />
                    <span className={`${tone} text-sm font-medium`}>
                      {net > 0.01
                        ? `is owed ${currencyLabel(net, displayCurrency)}`
                        : net < -0.01
                          ? `owes ${currencyLabel(Math.abs(net), displayCurrency)}`
                          : "settled"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-base-content/70">
                    Spent: {currencyLabel(balance?.paid ?? 0, displayCurrency)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-md border border-base-300 p-3">
            <h3 className="text-sm font-semibold">Optimized reimbursements</h3>
            <p className="text-xs text-base-content/70 mt-1">
              {group.members.length > 2
                ? "Reimbursements are minimized to reduce the number of payments."
                : "Reimbursement suggestion based on current balances."}
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {summary.settlements.length > 0 ? (
                summary.settlements.map((step, i) => {
                  const from = memberById.get(step.fromMemberId);
                  const to = memberById.get(step.toMemberId);
                  return (
                    <div
                      key={`${step.fromMemberId}-${step.toMemberId}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {from ? (
                          <MemberIdentity member={from} />
                        ) : (
                          <span>Unknown</span>
                        )}
                        <span className="text-base-content/70">pays</span>
                        <span className="font-semibold">
                          {currencyLabel(step.amount, displayCurrency)}
                        </span>
                        <span className="text-base-content/70">to</span>
                        {to ? (
                          <MemberIdentity member={to} />
                        ) : (
                          <span>Unknown</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() =>
                          recordReimbursement(
                            step.fromMemberId,
                            step.toMemberId,
                            step.amount,
                          )
                        }
                      >
                        Record
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-base-content/70">
                  Everyone is settled. No reimbursements needed.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
