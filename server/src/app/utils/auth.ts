import type { AuthContext } from "../../auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function requireAuth(c: { get: (key: string) => any }): AuthContext {
  const auth = c.get("auth") as AuthContext | null;
  if (!auth) throw new Error("Unauthorized");
  return auth;
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && err.message === "Unauthorized";
}

export function getUserIdFromSub(sub: string): string {
  return `user_${sub.replace(/:/g, "_")}`;
}
