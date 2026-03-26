import pg from 'pg';
import type { Db } from '../types/db.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/csub_admissions';
    pool = new Pool({ connectionString });
  }
  return pool;
}

export function createDb(): Db {
  const p = getPool();

  return {
    async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
      const { rows } = await p.query(sql, params);
      return rows[0] || null;
    },

    async queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
      const { rows } = await p.query(sql, params);
      return rows;
    },

    async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number | null; rows: unknown[] }> {
      const result = await p.query(sql, params);
      return { rowCount: result.rowCount, rows: result.rows };
    },

    async transaction<T>(fn: (txDb: Db) => Promise<T>): Promise<T> {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const txDb: Db = {
          async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
            const { rows } = await client.query(sql, params);
            return rows[0] || null;
          },
          async queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
            const { rows } = await client.query(sql, params);
            return rows;
          },
          async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number | null; rows: unknown[] }> {
            const result = await client.query(sql, params);
            return { rowCount: result.rowCount, rows: result.rows };
          },
          // transaction and end are not used within a transaction context,
          // but included to satisfy the Db interface
          transaction: undefined as never,
          end: undefined as never,
        };
        const result = await fn(txDb);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async end(): Promise<void> {
      await p.end();
      pool = null;
    },
  };
}

export function paramBuilder(start: number = 0): { next(): string; readonly count: number } {
  let i = start;
  return {
    next() { return `$${++i}`; },
    get count() { return i; },
  };
}
