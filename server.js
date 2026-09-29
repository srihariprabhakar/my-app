const express = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// PostgreSQL connection (via DATABASE_URL injected by App Platform)
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

// Valkey/Redis connection (optional)
let redis;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    tls: { rejectUnauthorized: false },
  });
}

app.get('/', async (req, res) => {
  res.json({
    status: 'ok',
    service: 'my-app',
    time: new Date().toISOString(),
  });
});

// Health endpoint that verifies DB connectivity
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

// A small persistence demo: record visits in Postgres + bump a Valkey counter
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
