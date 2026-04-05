import type Database from "better-sqlite3";

export type SqlStatement = {
  sql: string;
  params?: unknown[];
};

export type SqlRunResult = {
  changes: number;
  lastRowId: number | null;
};

export interface SqlAdapter {
  first<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;
  all<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<SqlRunResult>;
  batch(statements: SqlStatement[]): Promise<void>;
}

// Minimal local D1 declarations avoid pulling Worker-only type packages into Node build.
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<{ meta: { changes: number; last_row_id: number } }>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    meta: Record<string, unknown>;
  }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatement[],
  ): Promise<Array<{ results: T[]; meta: Record<string, unknown> }>>;
}

export function createSqliteAdapter(db: Database.Database): SqlAdapter {
  return {
    async first<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) {
      const row = db.prepare(sql).get(...params);
      return (row as T | undefined) ?? null;
    },

    async all<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) {
      return db.prepare(sql).all(...params) as T[];
    },

    async run(sql: string, params: unknown[] = []) {
      const result = db.prepare(sql).run(...params);
      return {
        changes: result.changes,
        lastRowId:
          typeof result.lastInsertRowid === "number"
            ? result.lastInsertRowid
            : Number(result.lastInsertRowid ?? 0),
      };
    },

    async batch(statements: SqlStatement[]) {
      if (statements.length === 0) {
        return;
      }

      const transaction = db.transaction((items: SqlStatement[]) => {
        items.forEach((statement) => {
          const params = statement.params ?? [];
          db.prepare(statement.sql).run(...params);
        });
      });

      transaction(statements);
    },
  };
}

export function createD1Adapter(db: D1Database): SqlAdapter {
  return {
    async first<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) {
      return db
        .prepare(sql)
        .bind(...params)
        .first<T>();
    },

    async all<T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ) {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return result.results;
    },

    async run(sql: string, params: unknown[] = []) {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .run();
      return {
        changes: result.meta.changes,
        lastRowId: result.meta.last_row_id ?? null,
      };
    },

    async batch(statements: SqlStatement[]) {
      if (statements.length === 0) {
        return;
      }

      await db.batch(
        statements.map((statement) =>
          db.prepare(statement.sql).bind(...(statement.params ?? [])),
        ),
      );
    },
  };
}

type SqliteRunLike = {
  changes: number;
  lastInsertRowid: number | bigint;
};

class SqlitePreparedStatement implements D1PreparedStatement {
  private boundValues: unknown[] = [];

  constructor(
    private readonly db: Database.Database,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]) {
    this.boundValues = values;
    return this;
  }

  getQuery() {
    return this.query;
  }

  getBoundValues() {
    return this.boundValues;
  }

  async first<T = Record<string, unknown>>() {
    const row = this.db.prepare(this.query).get(...this.boundValues) as
      | T
      | undefined;
    return row ?? null;
  }

  async run() {
    const result = this.db
      .prepare(this.query)
      .run(...this.boundValues) as SqliteRunLike;
    return {
      meta: {
        changes: result.changes,
        last_row_id:
          typeof result.lastInsertRowid === "number"
            ? result.lastInsertRowid
            : Number(result.lastInsertRowid ?? 0),
      },
    };
  }

  async all<T = Record<string, unknown>>() {
    return {
      results: this.db.prepare(this.query).all(...this.boundValues) as T[],
      meta: {},
    };
  }
}

export function createSqliteD1Database(db: Database.Database): D1Database {
  return {
    prepare(query: string) {
      return new SqlitePreparedStatement(db, query);
    },

    async batch(statements: D1PreparedStatement[]) {
      const sqliteStatements = statements as SqlitePreparedStatement[];
      if (sqliteStatements.length === 0) {
        return [];
      }

      const transaction = db.transaction((items: SqlitePreparedStatement[]) =>
        items.map((statement) => {
          const result = db
            .prepare(statement.getQuery())
            .run(...statement.getBoundValues()) as SqliteRunLike;

          return {
            results: [],
            meta: {
              changes: result.changes,
              last_row_id:
                typeof result.lastInsertRowid === "number"
                  ? result.lastInsertRowid
                  : Number(result.lastInsertRowid ?? 0),
            },
          };
        }),
      );

      return transaction(sqliteStatements);
    },
  };
}

export function createD1Database(db: D1Database): D1Database {
  return db;
}
