export function parseSplitData(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function serializeSplitData(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function replaceMemberInSplitData(
  raw: string | null,
  fromId: string,
  toId: string,
): string | null {
  const parsed = parseSplitData(raw) as {
    includedMemberIds?: unknown;
    values?: unknown;
  } | null;
  if (!parsed || typeof parsed !== "object") return raw;

  const included = Array.isArray(parsed.includedMemberIds)
    ? (parsed.includedMemberIds as string[])
        .filter((v): v is string => typeof v === "string")
        .map((v) => (v === fromId ? toId : v))
    : [];
  const dedupedIncluded = Array.from(new Set(included));
  const values =
    parsed.values && typeof parsed.values === "object"
      ? { ...(parsed.values as Record<string, number>) }
      : {};

  if (Object.prototype.hasOwnProperty.call(values, fromId)) {
    values[toId] = Number(values[toId] || 0) + Number(values[fromId] || 0);
    delete values[fromId];
  }
  return serializeSplitData({ includedMemberIds: dedupedIncluded, values });
}
