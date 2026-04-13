import type { CsvImportRow } from "../types";

export function sanitizeTextValue(value: unknown, maxLength = 200): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeAmountValue(value: unknown): number | null {
  if (typeof value === "number")
    return Number.isFinite(value)
      ? Math.round(Math.abs(value) * 100) / 100
      : null;
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "-.")
    return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed)
    ? Math.round(Math.abs(parsed) * 100) / 100
    : null;
}

export function sanitizeDateValue(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const raw = value.trim();
  if (!raw) return new Date().toISOString();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const fb = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    if (!Number.isNaN(fb.getTime())) return fb.toISOString();
  }
  return new Date().toISOString();
}

export function resolvePaidById(
  value: unknown,
  members: Array<{ id: string; email: string; name: string | null }>,
  fallbackUserId: string,
): string {
  if (typeof value !== "string" || !value.trim())
    return members[0]?.id || fallbackUserId;
  const norm = value.trim().toLowerCase();
  const matched = members.find(
    (m) =>
      m.id.toLowerCase() === norm ||
      m.email.toLowerCase() === norm ||
      (m.name && m.name.toLowerCase() === norm),
  );
  return matched?.id || members[0]?.id || fallbackUserId;
}

export function sanitizeImportRow(
  row: CsvImportRow,
  members: Array<{ id: string; email: string; name: string | null }>,
  fallbackUserId: string,
): {
  amount: number;
  name: string;
  details: string;
  transactionDate: string;
  category: string | null;
  tags: string | null;
  currency: string | null;
  paidById: string;
  splitValues: string | null;
  splitPeople: string | null;
} | null {
  const amount = sanitizeAmountValue(row.amount);
  if (amount === null) return null;
  return {
    amount,
    name: sanitizeTextValue(row.name, 120) || "Imported transaction",
    details: sanitizeTextValue(row.description, 300),
    transactionDate: sanitizeDateValue(row.transactionDate),
    category: sanitizeTextValue(row.category, 80) || null,
    tags: sanitizeTextValue(row.tags, 120) || null,
    currency: sanitizeTextValue(row.currency, 20) || null,
    paidById: resolvePaidById(row.paidById, members, fallbackUserId),
    splitValues: sanitizeTextValue(row.splitValues, 300) || null,
    splitPeople: sanitizeTextValue(row.splitPeople, 300) || null,
  };
}

export function parseSplitFromCsv(
  splitValuesStr: string | null,
  splitPeopleStr: string | null,
  members: Array<{ id: string; email: string; name: string | null }>,
  paidByIdMapping: Record<string, string>,
): {
  type: "equal" | "amount" | "percent";
  data: { includedMemberIds: string[]; values: Record<string, number> } | null;
} {
  // If no split data provided, return equal split with no data
  if (!splitValuesStr || !splitPeopleStr) {
    return { type: "equal", data: null };
  }

  const valuesParts = splitValuesStr
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  const peopleParts = splitPeopleStr
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Lists must have same length
  if (valuesParts.length !== peopleParts.length || valuesParts.length === 0) {
    return { type: "equal", data: null };
  }

  // Parse values as numbers
  const parsedValues: number[] = [];
  for (const val of valuesParts) {
    const num = parseFloat(val.replace(/,/g, ".").replace(/%/g, ""));
    if (Number.isNaN(num) || num < 0) {
      return { type: "equal", data: null };
    }
    parsedValues.push(num);
  }

  // Resolve people to member IDs
  const includedMemberIds: string[] = [];
  const values: Record<string, number> = {};

  for (let i = 0; i < peopleParts.length; i++) {
    const person = peopleParts[i];
    // First try paidByIdMapping, then try direct member lookup
    let memberId = paidByIdMapping[person];
    if (!memberId) {
      const member = members.find(
        (m) =>
          m.id === person ||
          m.email === person ||
          (m.name && m.name.toLowerCase() === person.toLowerCase()),
      );
      memberId = member?.id;
    }
    if (!memberId) {
      // If we can't resolve a person, fall back to equal split
      return { type: "equal", data: null };
    }
    if (!includedMemberIds.includes(memberId)) {
      includedMemberIds.push(memberId);
    }
    values[memberId] = (values[memberId] || 0) + parsedValues[i];
  }

  // Determine split type: if any value looks like percent, assume percent; otherwise amount
  const isPercent = valuesParts.some((v) => v.includes("%"));
  const splitType = isPercent ? "percent" : "amount";

  return {
    type: splitType,
    data: { includedMemberIds, values },
  };
}
