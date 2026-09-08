# Zenith HR — Production Deployment Guide

This document covers production environment configuration, Docker deployment, CI/CD, logging/monitoring, database backups, and a final readiness checklist for the Zenith Enterprise AI HR platform.

## Architecture (runtime)

```
Browser
  └─► nginx (web container :80)
        ├─ static Angular SPA (production build)
        └─ /api/*  ──proxy──► Express API (api container :3000)
                                  └─► PostgreSQL 16 (postgres)
```

| Service | Image / build | Role |
|---------|---------------|------|
| `web` | `AI-HR-Frontend` Dockerfile | SPA + reverse proxy to API |
| `api` | `AI-HR-Backend` Dockerfile | REST API, migrations on start |
| `postgres` | `postgres:16-alpine` | Primary datastore |
| `db-backup` | compose profile `backup` | One-shot `pg_dump` → `./backups` |

Repos: Angular 21 · Node.js 22 · Express 5 · Prisma 7 · PostgreSQL 16

## Environment configuration

1. Local / compose defaults: copy `.env.example` → `.env`
2. Production: copy `.env.production.example` → `.env.production` and replace every placeholder

### Critical production rules

| Variable | Rule |
|----------|------|
| `NODE_ENV` | Must be `production` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥ 32 chars, distinct, no weak markers (`change-me`, `example`, …). Startup refuses otherwise. |
| `DATABASE_URL` | Point at managed Postgres or compose service `postgres` |
| `CORS_ORIGIN` | Exact public web origin(s), comma-separated |
| `APP_URL` | Public SPA URL |
| `FILE_STORAGE_ROOT` | Persist via volume (`/app/uploads` in compose) |
| `AI_API_KEY` / `EMAIL_*` | Server-side only — never ship to Angular |

Frontend production builds use relative `apiBaseUrl: '/api/v1'` so the browser talks to the same origin; nginx proxies `/api/` to the API service.

## Deploy with Docker Compose

From `AI-HR-Backend` (frontend path is relative):

```bash
# Development-style full stack (Postgres published on host)
cp .env.example .env   # set strong JWTs even for local compose
docker compose up -d --build

# Production overlays (Postgres not published; uses .env.production)
cp .env.production.example .env.production
# edit secrets…
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Verify:

```bash
curl -s http://localhost:3000/api/v1/health/live
curl -s http://localhost:3000/api/v1/health/ready
curl -s http://localhost:8080/healthz
```

Open the SPA at `http://localhost:8080` (or your `WEB_PORT`).

API container runs `prisma migrate deploy` before listening. Seed separately when needed:

```bash
docker compose exec api npx prisma db seed
```

## CI/CD

GitHub Actions workflows:

| Repo | Workflow | Jobs |
|------|----------|------|
| Backend | `.github/workflows/ci.yml` | `npm ci` → Prisma generate → lint → tests → build |
| Frontend | `.github/workflows/ci.yml` | `npm ci` → `test:ci` → production build |

Suggested release flow:

1. Merge to `main` after green CI
2. Build/push images (or `docker compose build` on the host)
3. Apply env secrets via your secret store / `.env.production` on the server
4. Rolling restart: `docker compose … up -d`
5. Confirm `/health/ready` then smoke-login

## Logging & monitoring

| Signal | Where |
|--------|-------|
| Structured JSON logs (prod) | stdout + `logs/combined.log` / `logs/error.log` (volume `zenith_api_logs`) |
| Access logs | Morgan → Winston (`rid=` request id) |
| Correlation | `X-Request-Id` request/response header |
| Liveness | `GET /api/v1/health/live` |
| Readiness | `GET /api/v1/health/ready` |
| Full health | `GET /api/v1/health` |
| Process metrics | `GET /api/v1/health/metrics` (uptime, memory) |
| Web probe | `GET /healthz` on nginx |

Wire your orchestrator/LB health checks to **live** (restart decision) and **ready** (traffic decision). Scrape **metrics** with your preferred agent or synthetic monitor; for Prometheus-native exporters, add a sidecar later if needed.

## Database backup strategy

| Method | Command |
|--------|---------|
| Compose one-shot | `docker compose --profile backup run --rm db-backup` |
| Host script (Linux/macOS) | `./scripts/backup-db.sh` |
| Host script (Windows) | `.\scripts\backup-db.ps1` |

Recommendations:

- Retain at least **7 daily** and **4 weekly** dumps off-box (object storage)
- Test restore quarterly: `gunzip -c file.sql.gz | psql $DATABASE_URL`
- Prefer provider snapshots (RDS, Cloud SQL, Azure Flexible Server) **plus** logical dumps
- Encrypt backups at rest; never store dumps in the git repo (`backups/` is gitignored)
- Production compose overlay uses `ports: !reset []` on Postgres so the DB is not published on the host (requires Docker Compose v2.24+)

## API surface (ops)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Welcome / version |
| GET | `/api/v1/health` | Health summary |
| GET | `/api/v1/health/live` | Liveness |
| GET | `/api/v1/health/ready` | Readiness (DB) |
| GET | `/api/v1/health/metrics` | Process metrics |
| * | `/api/v1/*` | Application modules (auth, HR, AI, …) |

Full module tables remain in the root `README.md`.

## Production readiness checklist

- [ ] Strong, unique JWT secrets set; app starts without secret assertion failure
- [ ] `NODE_ENV=production`; CORS locked to real origins
- [ ] TLS terminated at load balancer / reverse proxy in front of nginx
- [ ] Postgres not exposed publicly; credentials rotated from defaults
- [ ] Persistent volumes for Postgres data + API uploads (+ logs if retained)
- [ ] Migrations applied (`migrate deploy` on API start or release job)
- [ ] Backup job scheduled and restore tested
- [ ] Health checks configured (live/ready)
- [ ] CI green on the release commit
- [ ] Demo passwords changed or seed disabled in production
- [ ] AI/email providers configured or left on safe mocks/console sinks intentionally
- [ ] Rate limits reviewed for expected traffic
- [ ] Log aggregation / alerting hooked to error volume and 5xx rates

## Known local limitations

Embedded/dev Postgres corruption (missing relation files) can block migrations/seeds on developer machines. Production should use Docker Postgres or a managed instance — not the embedded `data/pg_fresh` directory.
