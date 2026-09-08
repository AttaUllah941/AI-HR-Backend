# Zenith HR — Backend API

Express + TypeScript + Prisma API for the Zenith Enterprise AI HR platform.

## Current status

Foundation + **auth** (JWT/refresh/MFA/RBAC seed) and **health** are implemented. Other HR domain modules are not built yet — they will land in later review/build phases.

## Prerequisites

- Node.js 22+
- PostgreSQL 16+ (recommended via Docker Compose below)

## Quick start

```bash
cp .env.example .env
# Edit JWT secrets in .env before any non-local use

docker compose up -d postgres
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

API listens on `http://localhost:3000` (prefix `/api/v1`).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run migrations (dev) |
| `npm run prisma:seed` | Seed roles, permissions, company, demo admin |
| `npm run lint` | Typecheck |

## Architecture

```
src/
  config/         env, logger, database
  modules/        feature modules (Controller → Service → Repository)
  middleware/     auth, RBAC, errors, async handler
  routes/         API route aggregation
  services/       cross-cutting services (e.g. email sink)
  interfaces/     shared contracts
  utils/          AppError and helpers
prisma/           schema, migrations, seed
```

Do **not** commit local Postgres data directories. Persistence belongs in the Docker volume `zenith_pg_data` (or your managed DB). The `data/` folder is gitignored.

## Performance (Phase 10)

Authenticated endpoints under `/api/v1/performance` (RBAC: `performance:view|create|update|delete`):

| Method | Path | Description |
|---|---|---|
| GET | `/performance/summary` | Avg score, goals on track, promotion-ready count |
| GET | `/performance/top-performers` | Highest-scoring reviews for the cycle |
| GET | `/performance/insights` | AI suggestion cards |
| GET/POST | `/performance/reviews` | List / upsert reviews |
| PATCH/DELETE | `/performance/reviews/:id` | Update / soft-delete review |

## Recruitment (Phase 9)

Authenticated endpoints under `/api/v1/recruitment` (RBAC: `recruitment:view|create|update|delete`):

| Method | Path | Description |
|---|---|---|
| GET | `/recruitment/summary` | Open roles + candidates in flight + stage counts |
| GET | `/recruitment/pipeline` | Kanban columns (Applied → Hired) |
| POST | `/recruitment/ai-screen` | Score applied candidates and move to Screening |
| GET/POST | `/recruitment/jobs` | List / create job openings |
| PATCH/DELETE | `/recruitment/jobs/:id` | Update / soft-delete job |
| GET/POST | `/recruitment/candidates` | List / create candidates |
| PATCH/DELETE | `/recruitment/candidates/:id` | Update stage/score / soft-delete |

## Payroll (Phase 8)

Authenticated endpoints under `/api/v1/payroll` (RBAC: `payroll:view|create|update|delete`):

| Method | Path | Description |
|---|---|---|
| GET | `/payroll/summary` | Period totals (base/bonus/deductions/net) |
| GET | `/payroll/entries` | Paginated salary list |
| GET | `/payroll/export` | CSV export of salary list |
| POST | `/payroll/run` | Mark period payroll as completed |
| POST | `/payroll/entries` | Upsert salary entry |
| PATCH/DELETE | `/payroll/entries/:id` | Update / soft-delete entry |

## Leave (Phase 7)

Authenticated endpoints under `/api/v1/leave` (RBAC: `leave:view|create|update|delete`):

| Method | Path | Description |
|---|---|---|
| GET | `/leave/summary` | Balance KPIs + pending count |
| GET | `/leave/pending` | Pending leave requests |
| GET | `/leave/holidays` | Upcoming company holidays |
| GET | `/leave` | Paginated leave requests |
| POST | `/leave` | Create leave request |
| PATCH/DELETE | `/leave/:id` | Update / soft-delete (cancel) |

## Attendance (Phase 6)

Authenticated endpoints under `/api/v1/attendance` (RBAC: `attendance:view|create|update|delete`):

| Method | Path | Description |
|---|---|---|
| GET | `/attendance/summary` | Daily KPI counts (present/late/absent/remote/on leave) |
| GET | `/attendance/check-ins` | Recent check-ins for a day |
| GET | `/attendance/calendar` | Month day aggregates for team calendar |
| GET | `/attendance` | Paginated attendance records |
| POST | `/attendance` | Upsert daily attendance / check-in |
| PATCH/DELETE | `/attendance/:id` | Update / soft-delete |

## Employees (Phase 5)

Authenticated endpoints under `/api/v1/employees` (RBAC: `employees:view|create|update|delete`):

| Method | Path | Description |
|---|---|---|
| GET | `/employees` | Paginated directory (search, department, status, sort) |
| GET | `/employees/export` | CSV export of filtered directory |
| GET | `/employees/:id` | Employee detail |
| POST | `/employees` | Create employee |
| PATCH | `/employees/:id` | Update employee |
| DELETE | `/employees/:id` | Soft-delete employee |

## Organization (Phase 4)

Authenticated endpoints under `/api/v1/organization` (RBAC: `organization:view|create|update|delete`):

| Method | Path | Description |
|---|---|---|
| GET | `/organization/overview` | Company summary + counts |
| GET/PATCH | `/organization/company` | Company profile |
| GET/POST | `/organization/departments` | List / create departments |
| PATCH/DELETE | `/organization/departments/:id` | Update / soft-delete |
| GET/POST | `/organization/locations` | List / create locations |
| PATCH/DELETE | `/organization/locations/:id` | Update / soft-delete |

After pulling schema changes: `npx prisma migrate deploy` then `npm run prisma:seed`.

## Auth endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/auth/status` | No | Module status |
| POST | `/api/v1/auth/register` | No | Register user |
| POST | `/api/v1/auth/login` | No | Login (or MFA challenge) |
| POST | `/api/v1/auth/refresh` | No | Refresh tokens |
| POST | `/api/v1/auth/logout` | Yes | Revoke session |
| GET | `/api/v1/auth/me` | Yes | Current user + roles/permissions |
| POST | `/api/v1/auth/forgot-password` | No | Request reset |
| POST | `/api/v1/auth/reset-password` | No | Reset with token |
| POST | `/api/v1/auth/verify-email` | No | Verify email token |
| POST | `/api/v1/auth/mfa/verify` | No | Complete MFA login |
| POST | `/api/v1/auth/mfa/setup` | Yes | Begin MFA enrollment |
| POST | `/api/v1/auth/mfa/enable` | Yes | Confirm MFA enrollment |
| POST | `/api/v1/auth/mfa/disable` | Yes | Disable MFA |

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | No | Liveness + DB check |

### Seeded demo user

After `npm run prisma:seed`:

- Email: `admin@zenith.local`
- Password: `Password123!`

## Docker

```bash
docker compose up -d postgres   # DB only (named volume zenith_pg_data)
docker compose up --build       # API + DB (requires .env + Docker)
```

Compose default DB credentials (`zenith` / `zenith`) are for local development only — change them for shared or production environments.
