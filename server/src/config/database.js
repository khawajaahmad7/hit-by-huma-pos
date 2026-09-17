const mysql = require('mysql2/promise');

// MySQL configuration for cPanel shared hosting + Vercel serverless.
// Two ways to configure:
//   1. DATABASE_URL = mysql://user:password@host:3306/database (same format as the HIT-store website)
//   2. Individual DB_HOST / DB_USER / DB_PASSWORD / DB_NAME vars
// cPanel "Remote MySQL" must allow connections from '%' for Vercel.
const hasUrl = !!process.env.DATABASE_URL;

const useSSL = process.env.DB_SSL !== 'false' &&
  !['localhost', '127.0.0.1'].includes(
    hasUrl
      ? (process.env.DATABASE_URL.match(/@([^:/]+)/) || [])[1] || ''
      : process.env.DB_HOST || 'localhost'
  );

const config = hasUrl
  ? {
      uri: process.env.DATABASE_URL,
      // Keep small: shared hosting max_user_connections is low and each
      // serverless instance holds its own pool.
      connectionLimit: parseInt(process.env.DB_POOL_MAX || '5', 10),
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 15000,
      enableKeepAlives: true,
      charset: 'utf8mb4',
      dateStrings: true,
      ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      database: process.env.DB_NAME || 'hitbyhuma_pos',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      connectionLimit: parseInt(process.env.DB_POOL_MAX || '5', 10),
      waitForConnections: true,
      queueLimit: 0,
      connectTimeout: 15000,
      enableKeepAlives: true,
      charset: 'utf8mb4',
      dateStrings: true,
      ...(useSSL ? { ssl: { rejectUnauthorized: false } } : {}),
    };

let pool = null;

const getRawPool = () => {
  if (!pool) pool = mysql.createPool(config);
  return pool;
};

// Public pool: pg-compatible .query(q, values) -> { rows, recordset, rowCount, insertId }
const getPool = () => ({
  query: (q, p = []) => execute(q, Array.isArray(p) ? p : [p]),
});

const connect = async () => {
  await getRawPool().query('SELECT 1');
  return getPool();
};

const close = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

// Primary key map — needed to emulate INSERT ... RETURNING
const PK = {
  users: 'user_id',
  roles: 'role_id',
  shifts: 'shift_id',
  parked_sales: 'parked_id',
  products: 'product_id',
  product_variants: 'variant_id',
  categories: 'category_id',
  customers: 'customer_id',
  locations: 'location_id',
  inventory: 'inventory_id',
  sales: 'sale_id',
  sale_items: 'sale_item_id',
  sale_payments: 'sale_payment_id',
  payment_methods: 'payment_method_id',
  attributes: 'attribute_id',
  attribute_values: 'attribute_value_id',
  settings: 'setting_id',
  inventory_transactions: 'transaction_id',
};

// SQL dialect rewrites (T-SQL / Postgres -> MySQL)
const dialect = (sql) => sql
  .replace(/\bILIKE\b/g, 'LIKE')
  .replace(/\bISNULL\s*\(/g, 'IFNULL(')
  .replace(/\bN'/g, "'");

// Convert @name (object params) or $1..$n (array params) to MySQL '?'
const convert = (sql, params) => {
  if (Array.isArray(params)) {
    const values = [];
    const out = sql.replace(/\$(\d+)/g, (_, n) => {
      values.push(params[Number(n) - 1]);
      return '?';
    });
    return { sql: dialect(out), values };
  }

  const obj = params || {};
  const values = [];
  const out = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)(?![A-Za-z0-9_])/g, (m, name) => {
    if (!Object.prototype.hasOwnProperty.call(obj, name)) return m;
    values.push(obj[name]);
    return '?';
  });
  return { sql: dialect(out), values };
};

// Shape raw mysql2 result into the union of mssql/pg result shapes
const shape = (result) => {
  if (Array.isArray(result)) {
    return { rows: result, recordset: result, rowCount: result.length, rowsAffected: [-1] };
  }
  return {
    rows: [],
    recordset: [],
    rowCount: result.affectedRows,
    rowsAffected: [result.affectedRows],
    insertId: result.insertId,
  };
};

// Core executor with RETURNING / OUTPUT INSERTED emulation
const execute = async (queryString, params = []) => {
  let { sql: q, values } = convert(queryString, params);

  // mssql: strip OUTPUT INSERTED.* (treated as RETURNING *)
  let hadOutput = false;
  q = q.replace(/,\s*OUTPUT\s+INSERTED\.\*/i, () => { hadOutput = true; return ''; });
  q = q.replace(/\bOUTPUT\s+INSERTED\.\*/i, () => { hadOutput = true; return ''; });

  // Postgres: RETURNING <cols> at end of statement
  let returning = null;
  const m = q.match(/\bRETURNING\s+(.+?)(?:\s*)$/i);
  if (m) {
    returning = m[1].trim();
    q = q.slice(0, m.index).trim();
  } else if (hadOutput) {
    returning = '*';
  }

  const [result] = await getRawPool().query(q, values);

  if (Array.isArray(result)) return shape(result);

  const shaped = shape(result);

  if (returning) {
    const verb = q.trimStart().slice(0, 6).toUpperCase();
    try {
      if (verb.startsWith('INSERT') && result.insertId) {
        const t = q.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?/i);
        const pk = t && PK[t[1]];
        if (pk) {
          const [rows] = await getRawPool().query(
            `SELECT ${returning} FROM \`${t[1]}\` WHERE \`${pk}\` = ?`,
            [result.insertId]
          );
          shaped.rows = shaped.recordset = rows;
        }
      } else if (verb.startsWith('UPDATE') && result.affectedRows > 0) {
        const t = q.match(/UPDATE\s+`?(\w+)`?/i);
        const wIdx = q.search(/\sWHERE\s/i);
        if (t && wIdx !== -1) {
          const before = q.slice(0, wIdx);
          const numBefore = (before.match(/\?/g) || []).length;
          const whereSql = q.slice(wIdx);
          const whereParams = values.slice(numBefore);
          const [rows] = await getRawPool().query(
            `SELECT ${returning} FROM \`${t[1]}\` ${whereSql}`,
            whereParams
          );
          shaped.rows = shaped.recordset = rows;
        }
      }
    } catch (e) {
      // RETURNING emulation failed — return basic result rather than failing the request
      console.error('RETURNING emulation failed:', e.message);
    }
  }

  return shaped;
};

// Transaction helper (routes currently unused, kept for sale atomicity work)
const transaction = async (callback) => {
  const conn = await getRawPool().getConnection();
  const connQuery = (queryString, params = []) => {
    const { sql: q, values } = convert(queryString, params);
    return conn.query(q, values).then(([result]) => shape(result));
  };
  try {
    await conn.beginTransaction();
    const result = await callback({ query: connQuery });
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

// mssql-style request() compatibility (pool.request().input().query())
const request = () => {
  const inputs = {};
  const req = {
    input: (name, typeOrValue, value) => {
      inputs[name] = value !== undefined ? value : typeOrValue;
      return req;
    },
    query: (queryString) => execute(queryString, inputs),
  };
  return req;
};

module.exports = {
  pool: {
    request,
    query: (q, p) => execute(q, p),
  },
  connect,
  close,
  getPool,
  transaction,
  query: (q, p) => execute(q, p),
};
