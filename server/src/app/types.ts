import type { AuthContext } from "../auth";
import type { D1Database } from "../platform/sql-adapter";

export type Variables = { auth: AuthContext | null };
export type HonoCtx = { Variables: Variables };

export type ApiAppOptions = {
  db: D1Database;
  verifyToken: (token: string) => Promise<AuthContext | null>;
  getAllowedCorsOrigins: () => string[];
  getFrontendBaseUrl: () => string;
  appName: string;
  healthMessage: string;
  runtime: string;
};

export type TemporaryMemberPayload = {
  id?: string;
  name: string;
  email: string | null;
};

export type CsvImportField =
  | "amount"
  | "name"
  | "description"
  | "transactionDate"
  | "category"
  | "tags"
  | "currency"
  | "paidById"
  | "splitValues"
  | "splitPeople";
export type CsvMapping = Partial<Record<CsvImportField, string | string[]>>;
export type CsvImportRow = Partial<
  Record<CsvImportField, string | number | null | undefined>
>;

export type RouteDeps = {
  db: D1Database;
  frontendBaseUrl: string;
};
