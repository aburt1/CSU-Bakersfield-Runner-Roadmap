import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/csub_admissions';
    pool = new Pool({ connectionString });
  }
  return pool;
}

export function createDb() {
  const p = getPool();

  return {
    async queryOne(sql, params = []) {
      const { rows } = await p.query(sql, params);
      return rows[0] || null;
    },

    async queryAll(sql, params = []) {
      const { rows } = await p.query(sql, params);
      return rows;
    },

    async execute(sql, params = []) {
      const result = await p.query(sql, params);
      return { rowCount: result.rowCount, rows: result.rows };
    },

    async transaction(fn) {
      const client = await p.connect();
      try {
        await client.query('BEGIN');
        const txDb = {
          async queryOne(sql, params = []) {
            const { rows } = await client.query(sql, params);
            return rows[0] || null;
          },
          async queryAll(sql, params = []) {
            const { rows } = await client.query(sql, params);
            return rows;
          },
          async execute(sql, params = []) {
            const result = await client.query(sql, params);
            return { rowCount: result.rowCount, rows: result.rows };
          },
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

    async end() {
      await p.end();
      pool = null;
    },
  };
}

export function paramBuilder(start = 0) {
  let i = start;
  return {
    next() { return `$${++i}`; },
    get count() { return i; },
  };
}
