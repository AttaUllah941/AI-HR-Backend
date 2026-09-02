# Zenith HR — Backend API

Express + TypeScript + Prisma API for the Zenith Enterprise AI HR platform.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start API with hot reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run migrations (dev) |
| `npm run prisma:seed` | Seed roles, permissions, company |
| `npm run lint` | Typecheck |

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

### Seeded demo user

After `npm run prisma:seed`:

- Email: `admin@zenith.local`
- Password: `Password123!`

## Docker

```bash
docker compose up -d postgres   # DB only
docker compose up --build       # API + DB (requires Docker)
```
