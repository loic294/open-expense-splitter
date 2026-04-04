import type { Group, GroupMember, SplitData, Transaction } from "../types";

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
    name: raw.name || raw.description || "",
    description: raw.details || "",
    transactionDate: getDateInputValue(raw.transaction_date || raw.date),
    category: raw.category || "",
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
  return member.name || member.email;
}
