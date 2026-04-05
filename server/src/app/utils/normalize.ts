import type { TemporaryMemberPayload } from "../types";

export function normalizeMemberIds(
  ownerId: string,
  memberIds: unknown,
): string[] {
  const ids = Array.isArray(memberIds)
    ? memberIds.filter((v): v is string => typeof v === "string")
    : [];
  return Array.from(new Set([ownerId, ...ids]));
}

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidEmail(v: string): boolean {
  return /^\S+@\S+\.\S+$/.test(v);
}

export function buildInviteUrl(path: string, frontendBaseUrl: string): string {
  return `${frontendBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function normalizeTemporaryMembers(
  raw: unknown,
): TemporaryMemberPayload[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null,
    )
    .map((v) => ({
      id: typeof v.id === "string" && v.id.trim() ? v.id.trim() : undefined,
      name: typeof v.name === "string" ? v.name.trim().slice(0, 80) : "",
      email: normalizeEmail(v.email) || null,
    }))
    .filter((v) => v.name.length > 0)
    .filter((v) => {
      const key = v.id || `${v.name}|${v.email || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
