export interface Db {
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  queryAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }>;
  transaction<T>(fn: (txDb: Db) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}
