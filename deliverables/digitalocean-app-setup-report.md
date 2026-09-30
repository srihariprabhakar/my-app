# DigitalOcean Application Stack — Customer Recommendations

**Prepared:** 2026-09-29
**Account:** sprabhakar@digitalocean.com

---

## 1. What Was Built

A complete, working reference implementation deployed on DigitalOcean, connecting a web
application to two managed databases.

| Component | Resource | Region | Tier |
|---|---|---|---|
| Web application | `my-app` (App Platform) | nyc | `basic-xxs` |
| Relational database | `my-app-pg` (PostgreSQL 18) | nyc1 | `db-s-1vcpu-1gb` |
| Cache / session store | `my-app-valkey` (Valkey 8) | nyc1 | `db-s-1vcpu-1gb` |

- **Live URL:** https://my-app-2x7kf.ondigitalocean.app
- **Source code:** https://github.com/srihariprabhakar/my-app
- **Stack:** Node.js (Express), PostgreSQL, Valkey (Redis-compatible)

### Verified end-to-end

- `GET /health` → `{"checks":{"postgres":"ok","valkey":"ok"}}`
- `POST /visit` → writes a record to PostgreSQL and increments a Valkey counter
- App Platform reports the web component as `HEALTHY`

### Application endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Liveness check |
| GET | `/health` | Verifies both database connections |
| POST | `/visit` | Persists a note to Postgres + bumps Valkey counter |

---

## 2. Cost Estimate

Approximate monthly list prices for this exact configuration:

| Resource | Tier | Est. USD / month |
|---|---|---|
| App Platform service | `basic-xxs` (1 instance) | ~$5 |
| Managed PostgreSQL | `db-s-1vcpu-1gb` | ~$15 |
| Managed Valkey | `db-s-1vcpu-1gb` | ~$15 |
| **Total** | | **~$35 / month** |

**Build costs:** Negligible. Each deployment builds in ~11–13 billable seconds, costing a
fraction of a cent. Only the running resources (the app instance plus two databases)
generate steady monthly billing.

> Note: Figures are approximate U.S. list prices. Confirm exact engine/version pricing in
> the DigitalOcean billing dashboard, as database node pricing can vary slightly by engine
> and version.

---

## 3. Scaling Recommendations

- **Vertical first, then horizontal.** Increase `instance_size_slug` (e.g. `basic-xxs` →
  `basic-xs` → `basic-s`) before adding replicas; the database tier is usually the
  bottleneck under load.
- **Scale the app out** when CPU-bound: raise `instance_count` from 1 to 2+ — App Platform
  load-balances automatically (up to 250 instances).
- **Scale the database up** (e.g. `db-s-2vcpu-4gb` or a `gd-` size) before considering read
  replicas or high-availability tiers.
- **Add connection pooling** (PgBouncer or `pg` pool config) as concurrency grows; stay
  within the managed cluster's connection limits.
- **Enable autoscaling** for variable traffic; downscale back to the smallest tiers when
  idle to control cost.

---

## 4. Reliability Assessment

This is a **solid, reliable foundation** for small-to-medium production workloads.

**Strengths**

- Managed databases provide automated backups, patching, snapshots, and role management.
- App Platform provides zero-downtime deploys, automatic HTTPS/TLS, health checks, crash
  restarts, and a default load balancer.
- All three resources share the same region (`nyc` / `nyc1`), keeping app↔database latency low.

**Considerations for production hardening**

- Databases are currently **single-node** (`num_nodes: 1`) with no automatic failover —
  add a standby node or managed high-availability tier for mission-critical data.
- `basic-xxs` and `db-s-1vcpu-1gb` are dev-oriented sizes; they will throttle under real
  load and should be right-sized before launch.
- Add alerting beyond `DEPLOYMENT_FAILED` (e.g. CPU/memory thresholds) and point the App
  Platform liveness check at a lightweight endpoint.

---

## 5. Implementation Details (for technical reviewers)

**Service wiring:** App Platform injects database connection info via environment
variables. This deployment explicitly sets `DATABASE_URL` (PostgreSQL) and `REDIS_URL`
(Valkey) as encrypted `SECRET` env vars.

**Key technical note:** DigitalOcean managed database URIs carry `sslmode=require`, which
`node-postgres` interprets as `verify-full` and rejects on the CA chain. The app strips
that parameter and supplies `ssl: { rejectUnauthorized: false }` for a stable connection.
