// A tiny D1-compatible facade over a Durable Object's built-in SQLite, so the game engine
// (written against D1) runs unchanged inside every character's private database.
//
// Durable Object SQL is synchronous and single-threaded, so each request runs to completion
// without interleaving, and batch() is a real transaction (transactionSync).

type Row = Record<string, unknown>;

class DoStatement {
  constructor(
    private readonly db: DoDb,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new DoStatement(this.db, this.sql, params);
  }

  /** Executes synchronously and returns a D1-shaped result. */
  execSync(): D1Result<Row> {
    const cursor = this.db.storage.sql.exec(this.sql, ...(this.params as SqlStorageValue[]));
    const results = cursor.toArray() as Row[];
    const isWrite = !/^\s*(SELECT|WITH|PRAGMA)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql);
    const changes = isWrite ? Number(this.db.storage.sql.exec("SELECT changes() AS c").one().c) : 0;
    return {
      results,
      success: true,
      meta: {
        changes,
        last_row_id: 0,
        duration: 0,
        rows_read: cursor.rowsRead,
        rows_written: cursor.rowsWritten,
        changed_db: changes > 0,
        size_after: 0,
      },
    } as unknown as D1Result<Row>;
  }

  async all<T = Row>() {
    return this.execSync() as unknown as D1Result<T>;
  }

  async run<T = Row>() {
    return this.execSync() as unknown as D1Result<T>;
  }

  async first<T = Row>(col?: string): Promise<T | null> {
    const row = this.execSync().results[0];
    if (!row) return null;
    return (col ? (row[col] as T) : (row as T)) ?? null;
  }

  async raw<T = unknown[]>() {
    return this.execSync().results.map((r) => Object.values(r)) as T[];
  }
}

export class DoDb {
  constructor(readonly storage: DurableObjectStorage) {}

  prepare(sql: string) {
    return new DoStatement(this, sql);
  }

  /** All statements succeed or none do. */
  async batch<T = Row>(stmts: DoStatement[]) {
    return this.storage.transactionSync(() => stmts.map((s) => s.execSync())) as unknown as D1Result<T>[];
  }

  async exec(sql: string) {
    for (const part of splitSql(sql)) this.storage.sql.exec(part);
    return { count: 0, duration: 0 };
  }

  /** Lets game code keep its D1Database type. */
  asD1() {
    return this as unknown as D1Database;
  }
}

/** Splits a .sql file into statements (strips -- comments; our SQL has no ';' inside strings). */
export function splitSql(sql: string) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
