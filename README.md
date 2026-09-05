# Zenith HR — Backend API

Express + TypeScript + Prisma API for the Zenith Enterprise AI HR platform.

## Scripts

| Command | Description |
|---|---|
| `npm run db:up` | Start embedded PostgreSQL (keep this terminal open) |
| `npm run dev` | Start API with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run migrations (dev) |
| `npm run prisma:seed` | Seed roles, permissions, company |
| `npm run lint` | Typecheck |

## Local database

1. Copy `.env.example` to `.env` if needed.
2. In one terminal: `npm run db:up` (must stay running).
3. In another: `npm run prisma:migrate` then `npm run prisma:seed` (first setup).
4. Start the API: `npm run dev`.

Auth and other Prisma queries fail with cryptic `findFirst` errors if Postgres is stopped or crashed. Restart with `npm run db:up` before retrying.

## Architecture

```
src/
  config/         env, logger, database
  modules/        feature modules (Controller → Service → Repository)
  middleware/     auth, RBAC, errors, async handler
  routes/         API route aggregation
  interfaces/     shared contracts
  utils/          AppError and helpers
prisma/           schema, migrations, seed
```

## Phase 2 auth endpoints

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

## Phase 3 dashboard endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | Yes (`dashboard:view`) | KPIs, trends, calendar, quick actions, AI insight slots |
| GET | `/api/v1/dashboard/activity` | Yes (`dashboard:view`) | Recent audit activity |
| GET | `/api/v1/dashboard/notifications` | Yes (`dashboard:view`) | Notification menu feed |

## Phase 4 organization endpoints

All require auth. View endpoints use `organization:view`; mutations use `create` / `update` / `delete`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/organization/overview` | Company + entity counts |
| GET | `/api/v1/organization/chart` | Department hierarchy org chart |
| GET/POST | `/api/v1/organization/branches` | List / create branches |
| PATCH/DELETE | `/api/v1/organization/branches/:id` | Update / soft-delete branch |
| GET/POST | `/api/v1/organization/departments` | List / create departments |
| PATCH/DELETE | `/api/v1/organization/departments/:id` | Update / soft-delete department |
| GET/POST | `/api/v1/organization/teams` | List / create teams |
| PATCH/DELETE | `/api/v1/organization/teams/:id` | Update / soft-delete team |
| GET/POST | `/api/v1/organization/designations` | List / create designations |
| PATCH/DELETE | `/api/v1/organization/designations/:id` | Update / soft-delete designation |

## Phase 5 employee endpoints

All require auth. View endpoints use `employees:view`; create/delete use `employees:create` / `employees:delete`; profile and sub-resource mutations use `employees:update`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/employees` | Paginated list (search, filters, sort) |
| GET | `/api/v1/employees/:id` | Full employee profile + sub-resources |
| POST | `/api/v1/employees` | Create employee |
| PATCH | `/api/v1/employees/:id` | Update employee |
| DELETE | `/api/v1/employees/:id` | Soft-delete employee |
| GET | `/api/v1/employees/:id/timeline` | Employment timeline events |
| GET | `/api/v1/employees/:id/activity` | Audit activity for employee |
| POST/PATCH/DELETE | `/api/v1/employees/:id/emergency-contacts` | Emergency contact CRUD |
| POST/PATCH/DELETE | `/api/v1/employees/:id/education` | Education CRUD |
| POST/PATCH/DELETE | `/api/v1/employees/:id/experience` | Experience CRUD |
| POST/PATCH/DELETE | `/api/v1/employees/:id/skills` | Skills CRUD |
| POST/PATCH/DELETE | `/api/v1/employees/:id/certifications` | Certifications CRUD |
| POST/PATCH/DELETE | `/api/v1/employees/:id/documents` | Documents CRUD |

## Phase 6 attendance endpoints

All require auth. View uses `attendance:view`; clock/create uses `attendance:create`; edits use `attendance:update`; overtime review uses `attendance:approve`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/attendance/summary` | Today (or date) KPI summary |
| GET | `/api/v1/attendance/records` | Paginated daily attendance |
| GET | `/api/v1/attendance/records/:id` | Single attendance record |
| POST/PATCH/DELETE | `/api/v1/attendance/records` | Manual attendance CRUD |
| POST | `/api/v1/attendance/clock-in` | Clock in |
| POST | `/api/v1/attendance/clock-out` | Clock out |
| GET | `/api/v1/attendance/me/today` | Current user’s today status |
| GET | `/api/v1/attendance/timesheet` | Employee timesheet range |
| GET | `/api/v1/attendance/report` | Status aggregation report |
| GET/POST/PATCH/DELETE | `/api/v1/attendance/shifts` | Shift management |
| GET/POST/PATCH/DELETE | `/api/v1/attendance/holidays` | Holiday calendar |
| GET/POST | `/api/v1/attendance/overtime` | Overtime requests |
| POST | `/api/v1/attendance/overtime/:id/approve` | Approve overtime |
| POST | `/api/v1/attendance/overtime/:id/reject` | Reject overtime |

## Phase 7 leave endpoints

All require auth. View uses `leave:view`; apply/cancel uses `leave:create`; types/balances/policy use `leave:update`; approve/reject uses `leave:approve`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/leave/me/summary` | Current user’s leave balances & KPIs |
| GET | `/api/v1/leave/calendar` | Leave calendar events (`from`/`to`) |
| GET | `/api/v1/leave/report` | Status aggregation report |
| GET/POST/PATCH/DELETE | `/api/v1/leave/types` | Leave type management |
| GET/PATCH | `/api/v1/leave/policy` | Company leave policy |
| GET/POST | `/api/v1/leave/balances` | Leave balances / upsert entitlement |
| GET/POST/PATCH | `/api/v1/leave/requests` | Leave request list/create/update |
| GET | `/api/v1/leave/requests/:id` | Single leave request |
| POST | `/api/v1/leave/requests/:id/approve` | Approve leave |
| POST | `/api/v1/leave/requests/:id/reject` | Reject leave |
| POST | `/api/v1/leave/requests/:id/cancel` | Cancel leave |

## Phase 8 payroll endpoints

All require auth. View uses `payroll:view`; create components/structures/runs uses `payroll:create`; update components/structures/tax and process runs uses `payroll:update`; approve/mark-paid uses `payroll:approve`; soft-delete components/structures and cancel runs uses `payroll:delete`. Employees with only `payroll:view` see their own payslips/summary; managers with create/update/approve see company-wide data.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/payroll/summary` | Company KPIs (or my summary if employee-only) |
| GET | `/api/v1/payroll/me/summary` | Personal YTD payroll summary |
| GET | `/api/v1/payroll/report` | Aggregates by status/month (`?year=`) |
| GET/POST | `/api/v1/payroll/components` | List / create salary components |
| PATCH/DELETE | `/api/v1/payroll/components/:id` | Update / soft-delete component |
| GET/POST | `/api/v1/payroll/structures` | List / create salary structures |
| GET/PATCH/DELETE | `/api/v1/payroll/structures/:id` | Get / update / soft-delete structure |
| GET/PATCH | `/api/v1/payroll/tax` | Get / update company tax settings |
| GET/POST | `/api/v1/payroll/runs` | List / create payroll runs |
| GET/PATCH | `/api/v1/payroll/runs/:id` | Get / update run |
| POST | `/api/v1/payroll/runs/:id/process` | Generate entries + payslips from structures |
| POST | `/api/v1/payroll/runs/:id/approve` | Approve completed run |
| POST | `/api/v1/payroll/runs/:id/mark-paid` | Mark approved run (and payslips) paid |
| POST | `/api/v1/payroll/runs/:id/cancel` | Cancel draft/completed run |
| GET | `/api/v1/payroll/runs/:id/entries` | List payroll entries for a run |
| GET | `/api/v1/payroll/payslips` | List payslips (scoped for employees) |
| GET | `/api/v1/payroll/payslips/:id` | Get payslip detail |
| GET | `/api/v1/payroll/me/payslips` | Current user’s payslips |

## Phase 9 recruitment endpoints

All require auth and a `recruitment:*` permission (no employee self-service). View uses `recruitment:view`; create jobs/candidates/applications/interviews/offers uses `recruitment:create`; update, attach resume, publish/close/hold jobs, advance application, complete interview, and send offer uses `recruitment:update`; respond to offers and advance to hired uses `recruitment:approve`; soft-delete / cancel uses `recruitment:delete`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/recruitment/summary` | Pipeline KPIs (open jobs, candidates, stage counts) |
| GET | `/api/v1/recruitment/pipeline` | Applications grouped by stage (`?jobOpeningId=`) |
| GET | `/api/v1/recruitment/report` | Status aggregation report |
| GET/POST | `/api/v1/recruitment/jobs` | List / create job openings |
| GET/PATCH/DELETE | `/api/v1/recruitment/jobs/:id` | Get / update / soft-delete job |
| POST | `/api/v1/recruitment/jobs/:id/publish` | DRAFT/ON_HOLD → OPEN |
| POST | `/api/v1/recruitment/jobs/:id/close` | OPEN/ON_HOLD → CLOSED |
| POST | `/api/v1/recruitment/jobs/:id/hold` | OPEN → ON_HOLD |
| GET/POST | `/api/v1/recruitment/candidates` | List / create candidates |
| GET/PATCH/DELETE | `/api/v1/recruitment/candidates/:id` | Get / update / soft-delete candidate |
| POST | `/api/v1/recruitment/candidates/:id/resume` | Attach resume URL metadata |
| POST | `/api/v1/recruitment/candidates/:id/screening` | Update screening score/notes |
| GET/POST | `/api/v1/recruitment/applications` | List / create applications (OPEN jobs only) |
| GET | `/api/v1/recruitment/applications/:id` | Application detail |
| PATCH | `/api/v1/recruitment/applications/:id/status` | Advance pipeline stage |
| POST | `/api/v1/recruitment/applications/:id/reject` | Reject application |
| GET/POST | `/api/v1/recruitment/interviews` | List / schedule interviews |
| GET/PATCH/DELETE | `/api/v1/recruitment/interviews/:id` | Get / update / cancel interview |
| POST | `/api/v1/recruitment/interviews/:id/complete` | Complete / no-show / cancel with feedback |
| GET/POST | `/api/v1/recruitment/offers` | List / create offers |
| GET/PATCH | `/api/v1/recruitment/offers/:id` | Get / update offer |
| POST | `/api/v1/recruitment/offers/:id/send` | DRAFT → SENT |
| POST | `/api/v1/recruitment/offers/:id/respond` | Accept (→ HIRED) or decline |

## Phase 10 performance endpoints

All require auth. View uses `performance:view`; create goals/kpis/reviews/feedback/promotions/cycles uses `performance:create`; update, submit review, acknowledge, and activate/close cycles uses `performance:update`; approve/reject promotions and complete reviews uses `performance:approve`; soft-delete / cancel / withdraw uses `performance:delete`. Employees with only `performance:view` see their own goals/reviews/feedback/promotions; managers with create/update/approve see company-wide data.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/performance/summary` | Company KPIs (or my summary if employee-only) |
| GET | `/api/v1/performance/me/summary` | Personal performance summary |
| GET | `/api/v1/performance/report` | Aggregates by status (`?year=`) |
| GET/POST | `/api/v1/performance/goals` | List / create goals |
| GET/PATCH/DELETE | `/api/v1/performance/goals/:id` | Get / update / soft-delete goal |
| GET/POST | `/api/v1/performance/kpis` | List / create KPI catalog |
| PATCH/DELETE | `/api/v1/performance/kpis/:id` | Update / soft-delete KPI |
| GET | `/api/v1/performance/employee-kpis` | List employee KPI scores |
| POST | `/api/v1/performance/employee-kpis` | Upsert employee KPI (unique employee+kpi+year+quarter) |
| GET/POST | `/api/v1/performance/cycles` | List / create review cycles |
| PATCH/DELETE | `/api/v1/performance/cycles/:id` | Update / soft-delete cycle |
| POST | `/api/v1/performance/cycles/:id/activate` | DRAFT → ACTIVE |
| POST | `/api/v1/performance/cycles/:id/close` | ACTIVE → CLOSED |
| GET/POST | `/api/v1/performance/reviews` | List / create reviews |
| GET/PATCH | `/api/v1/performance/reviews/:id` | Get / update review |
| POST | `/api/v1/performance/reviews/:id/submit` | DRAFT/IN_PROGRESS → SUBMITTED |
| POST | `/api/v1/performance/reviews/:id/acknowledge` | SUBMITTED → ACKNOWLEDGED |
| POST | `/api/v1/performance/reviews/:id/complete` | SUBMITTED/ACKNOWLEDGED → COMPLETED |
| GET/POST | `/api/v1/performance/feedback` | List / create feedback |
| GET | `/api/v1/performance/feedback/:id` | Feedback detail |
| DELETE | `/api/v1/performance/feedback/:id` | Soft-delete feedback |
| GET/POST | `/api/v1/performance/promotions` | List / create promotion requests |
| GET/PATCH | `/api/v1/performance/promotions/:id` | Get / update promotion |
| POST | `/api/v1/performance/promotions/:id/submit` | DRAFT → PENDING |
| POST | `/api/v1/performance/promotions/:id/review` | Approve/reject (`approve` boolean) |
| POST | `/api/v1/performance/promotions/:id/withdraw` | DRAFT/PENDING → WITHDRAWN |

## Phase 11 AI endpoints

AI keys (`AI_API_KEY`) stay server-side only and are never returned by the API. Default provider is **mock** (works offline/CI without a key). Set `AI_PROVIDER=openai` and `AI_API_KEY` to use an OpenAI-compatible Chat Completions endpoint (`AI_BASE_URL`, `AI_MODEL`).

Permissions: `ai:view` (read), `ai:create` (generate/chat), `ai:delete` (soft-delete). HR Manager / Recruiter get view+create+delete; Manager / Employee get view only (company insights & recommendations — not screening, appraisal, or policy drafts). Screening also requires `recruitment:view` (and `recruitment:update` to write scores). Appraisal requires `performance:view`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/ai/status` | Provider name + model + feature list (no keys) |
| GET | `/api/v1/ai/summary` | Usage counts by feature/status + recent generations |
| GET | `/api/v1/ai/insights` | Latest stored insights + company counts |
| POST | `/api/v1/ai/insights` | Refresh insights via AI (`focus` optional) |
| GET | `/api/v1/ai/recommendations` | Latest stored recommendations |
| POST | `/api/v1/ai/recommendations` | Refresh recommendations (`limit` optional) |
| GET | `/api/v1/ai/conversations` | List current user's conversations |
| POST | `/api/v1/ai/assistant/chat` | HR assistant chat (create/continue conversation) |
| GET | `/api/v1/ai/conversations/:id` | Conversation + messages |
| DELETE | `/api/v1/ai/conversations/:id` | Soft-delete conversation |
| POST | `/api/v1/ai/resume-screening` | Screen candidate resume; may update screening score |
| POST | `/api/v1/ai/appraisals` | Generate appraisal draft for an employee |
| POST | `/api/v1/ai/policies` | Generate markdown HR policy |
| GET | `/api/v1/ai/generations` | List AI generations (`?feature=`) |
| GET | `/api/v1/ai/generations/:id` | Generation detail |
| DELETE | `/api/v1/ai/generations/:id` | Soft-delete generation |

Every provider call is timed and written to `AiUsageLog` as `SUCCESS` or `FAILED`.

### Seeded demo user

After `npm run prisma:seed`:

- Admin: `admin@zenith.local` / `Password123!`
- Employee: `employee@zenith.local` / `Password123!`

## Docker

```bash
docker compose up -d postgres   # DB only
docker compose up --build       # API + DB (requires Docker)
```
