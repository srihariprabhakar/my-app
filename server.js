const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function sanitizeUri(uri) {
  if (!uri) return null;
  const u = new URL(uri);
  u.searchParams.delete('sslmode');
  return u.toString();
}

// Enumerate all env var KEYS that look like DB/connection config (no values).
function dbEnvKeys() {
  return Object.keys(process.env)
    .filter((k) => /DATABASE|DB|POSTGRES|REDIS|VALKEY|URL|HOST|PORT|USER|PASS/i.test(k))
    .sort();
}

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: sanitizeUri(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
}

let redis = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    tls: { rejectUnauthorized: false },
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
  });
}

app.get('/', async (req, res) => {
  res.json({ status: 'ok', service: 'my-app', time: new Date().toISOString() });
});

app.get('/env', (req, res) => res.json({ keys: dbEnvKeys() }));

app.get('/health', async (req, res) => {
  const checks = { postgres: 'not-configured', valkey: 'not-configured' };
  if (pool) {
    try { await pool.query('SELECT 1'); checks.postgres = 'ok'; }
    catch (err) { checks.postgres = 'error: ' + err.message; }
  }
  if (redis) {
    try { const pong = await redis.ping(); checks.valkey = pong === 'PONG' ? 'ok' : 'error'; }
    catch (err) { checks.valkey = 'error: ' + err.message; }
  }
  res.status(checks.postgres === 'ok' ? 200 : 503).json({ checks });
});

app.post('/visit', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'postgres not configured' });
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS visits (id SERIAL PRIMARY KEY, note TEXT, created_at TIMESTAMPTZ DEFAULT now())');
    const note = (req.body && req.body.note) || 'hello';
    await pool.query('INSERT INTO visits (note) VALUES ($1)', [note]);
    let count = null;
    if (redis) { try { count = await redis.incr('visits'); } catch (e) { count = 'redis-error'; } }
    res.json({ note, visit_count: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`my-app listening on port ${PORT}`));
