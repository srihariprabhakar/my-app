# my-app

A small Node.js web service deployed on DigitalOcean App Platform, connected to two
managed databases. It serves as a reference implementation for a "database + cache" stack.

## Stack

- **Node.js / Express** — web layer (stateless API)
- **PostgreSQL 18** — relational database (`my-app-pg`)
- **Valkey 8** (Redis-compatible) — in-memory cache / counters (`my-app-valkey`)

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Liveness check |
| `GET` | `/health` | Verifies both database connections |
| `POST` | `/visit` | Persists a note to Postgres + bumps a Valkey counter |

## How it works

- `POST /visit` inserts a row into a `visits` table in PostgreSQL and increments the
  `visits` key in Valkey, returning the running count.
- `GET /health` pings both databases and reports `{"postgres":"ok","valkey":"ok"}`.

## Configuration

Database connections are supplied via environment variables:

- `DATABASE_URL` — PostgreSQL connection URI
- `REDIS_URL` — Valkey/Redis connection URI
- `PORT` — HTTP port (defaults to 3000)

> **Note:** DigitalOcean managed database URIs carry `sslmode=require`, which
> `node-postgres` treats as `verify-full` and rejects on the CA chain. The app strips that
> parameter and supplies `ssl: { rejectUnauthorized: false }` so connections succeed.

## Running locally

```bash
npm install
DATABASE_URL='postgresql://...' REDIS_URL='rediss://...' npm start
```

Then visit `http://localhost:3000/health`.

## Deploying

The app is deployed via the DigitalOcean App Platform spec in `.do/app.yaml` (or directly
through an App Platform app spec referencing this repo).
