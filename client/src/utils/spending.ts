import type {
  Group,
  GroupExpenseSummary,
  GroupMember,
  MemberBalance,
  SplitData,
  Transaction,
} from "../types";

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

export function normalizeCurrency(raw?: string): string {
  const value = (raw || "").trim().toUpperCase();
  return SUPPORTED_CURRENCIES.includes(
    value as (typeof SUPPORTED_CURRENCIES)[number],
  )
    ? value
    : "USD";
}

export function normalizeSupportedCurrencies(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => normalizeCurrency(item));
  return Array.from(new Set(normalized));
}

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function currencyLabel(value: number, currency: string): string {
  const c = normalizeCurrency(currency);
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: c,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return c === "USD" ? `USD ${formatted}` : formatted;
}

export function exchangeRateCacheKey(
  date: string,
  baseCurrency: string,
  targetCurrency: string,
): string {
  return `${date}|${normalizeCurrency(baseCurrency)}|${normalizeCurrency(targetCurrency)}`;
}

export function createReimbursementSplitData(
  memberIds: string[],
  payerId: string,
  recipientId: string,
): SplitData {
  return {
    includedMemberIds: [payerId, recipientId],
    values: Object.fromEntries(
      memberIds.map((id) => [id, id === payerId ? 100 : 0]),
    ),
  };
}

function splitWeights(
  transaction: Transaction,
  includedMemberIds: string[],
): Record<string, number> {
  const weights: Record<string, number> = {};
  if (transaction.splitType === "equal") {
    includedMemberIds.forEach((id) => {
      weights[id] = 1;
    });
    return weights;
  }
  includedMemberIds.forEach((id) => {
    const raw = transaction.splitData.values[id] ?? 0;
    weights[id] = raw > 0 ? raw : 0;
  });
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  if (total <= 0)
    includedMemberIds.forEach((id) => {
      weights[id] = 1;
    });
  return weights;
}

function getReimbursementRecipientId(
  transaction: Transaction,
  memberSet: Set<string>,
): string | null {
  if (transaction.amount >= 0) return null;
  const included = transaction.splitData.includedMemberIds.filter((id) =>
    memberSet.has(id),
  );
  if (included.length !== 2 || !included.includes(transaction.paidById))
    return null;
  const recipientId =
    included.find((id) => id !== transaction.paidById) ?? null;
  if (!recipientId) return null;
  const payerW = transaction.splitData.values[transaction.paidById] ?? 0;
  const recW = transaction.splitData.values[recipientId] ?? 0;
  return payerW > 0 && recW <= 0 ? recipientId : null;
}

export function buildGroupExpenseSummary(
  members: GroupMember[],
  transactions: Transaction[],
  toDisplayAmount: (t: Transaction) => number,
): GroupExpenseSummary {
  const memberIds = members.map((m) => m.id);
  const memberSet = new Set(memberIds);
  const balances = new Map<string, MemberBalance>(
    memberIds.map((id) => [id, { memberId: id, paid: 0, owed: 0, net: 0 }]),
  );
  let totalExpenses = 0;

  transactions.forEach((t) => {
    const amount = Number(toDisplayAmount(t) || 0);
    if (amount === 0) return;
    const reimbRecipient = getReimbursementRecipientId(t, memberSet);
    if (reimbRecipient) {
      const transfer = Math.abs(amount);
      const payer = balances.get(t.paidById);
      if (payer) payer.paid += transfer;
      const rec = balances.get(reimbRecipient);
      if (rec) rec.owed += transfer;
      return;
    }
    if (amount < 0) return;
    totalExpenses += amount;
    const payer = balances.get(t.paidById);
    if (payer) payer.paid += amount;
    const included = t.splitData.includedMemberIds.filter((id) =>
      memberSet.has(id),
    );
    const split = included.length > 0 ? included : memberIds;
    if (split.length === 0) return;
    const weights = splitWeights(t, split);
    const totalW = Object.values(weights).reduce((s, v) => s + v, 0);
    const safeW = totalW > 0 ? totalW : split.length;
    split.forEach((id) => {
      const w = weights[id] ?? 1;
      const share = amount * (w / safeW);
      const b = balances.get(id);
      if (b) b.owed += share;
    });
  });

  const normalizedBalances = Array.from(balances.values()).map((b) => ({
    ...b,
    paid: roundCurrency(b.paid),
    owed: roundCurrency(b.owed),
    net: roundCurrency(b.paid - b.owed),
  }));

  const creditors = normalizedBalances
    .filter((b) => b.net > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, z) => z.net - a.net);
  const debtors = normalizedBalances
    .filter((b) => b.net < -0.01)
    .map((b) => ({ ...b, net: Math.abs(b.net) }))
    .sort((a, z) => z.net - a.net);

  const settlements = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = roundCurrency(Math.min(creditor.net, debtor.net));
    if (amount > 0.01) {
      settlements.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount,
      });
    }
    creditor.net = roundCurrency(creditor.net - amount);
    debtor.net = roundCurrency(debtor.net - amount);
    if (creditor.net <= 0.01) ci++;
    if (debtor.net <= 0.01) di++;
  }

  return {
    totalExpenses: roundCurrency(totalExpenses),
    balances: normalizedBalances,
    settlements,
  };
}

export function getDateInputValue(value?: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

export function createDefaultSplitData(memberIds: string[]): SplitData {
  return {
    includedMemberIds: memberIds,
    values: Object.fromEntries(memberIds.map((id) => [id, 0])),
  };
}

export function normalizeTransaction(
  raw: any,
  group: Group | null,
): Transaction {
  const memberIds = group?.members.map((member) => member.id) || [];
  const splitData = raw.split_data || createDefaultSplitData(memberIds);

  return {
    id: raw.id,
    batchId: raw.batch_id,
    amount: Number(raw.amount || 0),
    currency: normalizeCurrency(raw.currency),
    name: raw.name || raw.description || "",
    description: raw.details || "",
    transactionDate: getDateInputValue(raw.transaction_date || raw.date),
    category: raw.category || "",
    tags: raw.tags || "",
    paidById: raw.paid_by_id || memberIds[0] || "",
    splitType: raw.split_type || "equal",
    splitData: {
      includedMemberIds:
        splitData.includedMemberIds?.length > 0
          ? splitData.includedMemberIds
          : memberIds,
      values: splitData.values || {},
    },
  };
}

export function splitLabel(transaction: Transaction, members: GroupMember[]) {
  if (transaction.splitType === "percent") {
    return "Exact %";
  }

  if (transaction.splitType === "amount") {
    return "Exact amounts";
  }

  const includedCount = transaction.splitData.includedMemberIds.length;
  if (includedCount === 2) {
    return "50 / 50";
  }

  if (includedCount > 0) {
    return `Equal (${includedCount})`;
  }

  return `Equal (${members.length})`;
}

export function memberName(member: GroupMember) {
  return (
    member.name || member.email || member.temporary_email || "Temporary member"
  );
}
