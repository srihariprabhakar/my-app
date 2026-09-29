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

let poolConfig = null;
if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: sanitizeUri(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  };
}
const pool = poolConfig ? new Pool(poolConfig) : null;

let redis;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    tls: { rejectUnauthorized: false },
    connectTimeout: 5000,
    enableReadyCheck: true,
    maxRetriesPerRequest: 0,
  });
}

app.get('/', async (req, res) => {
  res.json({ status: 'ok', service: 'my-app', time: new Date().toISOString() });
});

app.get('/health', async (req, res) => {
  const checks = { postgres: 'not-configured', valkey: 'not-configured' };
  if (pool) {
    try {
      await pool.query('SELECT 1');
      checks.postgres = 'ok';
    } catch (err) {
      checks.postgres = 'error: ' + err.message;
    }
  }
  if (redis) {
    try {
      const pong = await redis.ping();
      checks.valkey = pong === 'PONG' ? 'ok' : 'error';
    } catch (err) {
      checks.valkey = 'error: ' + err.message;
    }
  }
  const healthy = checks.postgres === 'ok';
  res.status(healthy ? 200 : 503).json({ checks });
});

app.get('/dbinfo', async (req, res) => {
  const info = {};
  if (process.env.DATABASE_URL) {
    try {
      const u = new URL(process.env.DATABASE_URL);
      info.dataset_url_host = u.hostname;
      info.dataset_url_port = u.port;
      info.dataset_url_protocol = u.protocol;
    } catch (e) {
      info.dataset_url_host = 'unparseable';
    }
  } else {
    info.dataset_url_host = '(DATABASE_URL not set)';
  }
  info.has_redis = !!process.env.REDIS_URL;
  res.json(info);
});

app.post('/visit', async (req, res) => {
  if (!pool || !redis) {
    return res.status(503).json({ error: 'databases not configured' });
  }
  try {
    await pool.query(
      'CREATE TABLE IF NOT EXISTS visits (id SERIAL PRIMARY KEY, note TEXT, created_at TIMESTAMPTZ DEFAULT now())'
    );
    const note = (req.body && req.body.note) || 'hello';
    await pool.query('INSERT INTO visits (note) VALUES ($1)', [note]);
    const count = await redis.incr('visits');
    res.json({ note, visit_count: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`my-app listening on port ${PORT}`);
});
