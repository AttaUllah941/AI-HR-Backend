# Backend Audit: Zenith HR API

Scope: `AI-HR-Backend` (Express 5, Prisma 7, PostgreSQL). Read-only audit, no source files were modified.
Method: static reading of routes, middleware, services, repositories and `schema.prisma`, plus `git log` inspection. Nothing was executed or load-tested.
Confidence: findings marked **(unsure)** were not fully traced. Line numbers are from the working tree on branch `Review-The-App`.

Summary: the tenant isolation is sound (no direct cross-tenant IDOR found). The real risks are privilege-model gaps inside a tenant, missing database-level tenant guards, and index/pagination gaps.

---

## Critical

None found.

## High

### H1. Managers are effectively company-wide because `*:approve` is treated as company-wide
- `modules/performance/services/performance.service.ts:98` treats `performance:approve` as `canManageCompanyWide`, which bypasses direct-report scoping. MANAGER can read, update and delete any employee's goals, reviews, promotions and feedback. `completeReview` has no object check (`performance.routes.ts:173`).
- `modules/leave/services/leave.service.ts:94`: `leave:approve` grants `canManageOthers`, so managers read every leave request, balance and calendar entry. (Approving is correctly limited to direct reports via `assertCanReview`.)
- `modules/attendance/services/attendance.service.ts:76`: `attendance:approve` gives company-wide records and timesheets. Overtime approve/reject (`attendance.service.ts:680-712`, `attendance.routes.ts:108,114`) only blocks self-review, so a MANAGER can approve overtime for anyone.
- `/reports/*` (`reports.service.ts:242-292`, `reports.routes.ts:15-64`): MANAGER has `reports:view` plus `payroll:view`, and the reports module does no per-user scoping, so managers see company-wide payroll totals.
- Fix direction: scope manager reads to direct reports, or introduce an explicit company-wide permission distinct from `approve`.

### H2. `GET /dashboard/activity` returns company-wide audit logs to every `dashboard:view` holder
- `modules/dashboard/services/dashboard.service.ts:311-325` and `dashboard.repository.ts:25`. EMPLOYEE has `dashboard:view` (`prisma/seed.ts:42-146`). Response includes actor name/email, action, entityType, entityId.
- Verified by reading the service: `getActivity` filters by company only.
- Fix: gate on `settings:view` or filter to the caller's own entries.

### H3. `AuditLog` has no `companyId`, and the audit queries are un-indexed joins
- `prisma/schema.prisma:245-262`. Tenant scope is derived through `actor.companyId`, so system entries (null `actorId`) belong to no tenant. `settings.repository.ts:352-386` and `dashboard.repository.ts:26-40` join `users` and sort by `createdAt desc` with `skip`/`take` and `count`. This is a large, growing table.
- Fix: add `companyId` + `@@index([companyId, createdAt])`, plus `(actorId, createdAt)` and `(entityType, entityId, createdAt)`.

### H4. Case-insensitive search has no usable index
- `contains` + `mode:'insensitive'` becomes `ILIKE '%x%'`, which a btree cannot serve. No `pg_trgm`/GIN migration exists in `prisma/migrations`.
- Evidence: `employee.repository.ts:94-97`; `global.repository.ts:33-36, 60-61, 76-77, 92-94, 116-117, 155-157, 181-183`; `recruitment.repository.ts:178-179, 284-286`; `files.repository.ts:89-91`; `settings.repository.ts:63-65`; `security.repository.ts:77`; `attendance.repository.ts:250-253`.
- Fix: a raw-SQL migration with `pg_trgm` GIN indexes on employees (names, email, code), users, candidates, job openings, stored files, departments, branches.

### H5. Possible platform-wide privilege exposure through SUPER_ADMIN **(unsure)**
- Roles and Permissions are global tables shared by all tenants. `settings.repository.ts:318-339` (`replaceRolePermissions`) and `settings.service.ts:~598-640` restrict edits to Super Admin. If tenant creation or `auth.service` `registerUser` can assign SUPER_ADMIN to a tenant owner, that owner can alter permissions for every tenant. Not verified. Check `auth.service.ts` register path and `prisma/seed.ts`. (Registration comment says new tenants start as HR_ADMIN, which suggests SUPER_ADMIN is not granted, but this was not traced end to end.)

## Medium

### M1. By-id writes lack a database-level tenant guard
- Services check `repo.findX(companyId, id)` and then call `update/delete/updateMany({where:{id}})`. Safe today, but any future caller that skips the pre-check becomes a cross-tenant write, and there is a check-then-write gap.
- Files (all `where:{id}` only): `employee.repository.ts:181,226,242,262,301-416`; `attendance.repository.ts:154,171,210,228,381,389,482,492`; `leave.repository.ts:122,140,222,254,264,271,281,385`; `payroll.repository.ts:204,220,300,322,336,462,511,600,607`; `recruitment.repository.ts:230,258,270,351,375,386,454,466,530,547,559,617,632,640`; `performance.repository.ts:184,248,267,324,339,436,504-526,590-622,688,737,753,774,804`; `ai.repository.ts:169,336,346,456`; `notifications.repository.ts:109,130,269,276`; `files.repository.ts:154,172,195`; `organization.repository.ts:135,171,228,242,300,313,344,357`.
- The only business raw SQL is `leave.repository.ts:254` (`$executeRaw`, parameterized, id from a tenant-verified balance).
- Fix: `updateMany({where:{id, companyId}})` and check `count`. Composite `(companyId, id)` FKs are a larger follow-up.

### M2. Foreign keys are single-column, so the database cannot stop cross-tenant links
- Tenant integrity depends entirely on service pre-checks (employeeId, managerId, departmentId, etc. are verified in the services reviewed).

### M3. Self-registration is enabled by constant and cannot be turned off per deployment
- `utils/security.ts:109` `allowSelfRegistration: true`; `auth.service.ts:61` checks only that constant. `settings.service.ts:148` sets it to `false` for company policies, but registration reads the default. Registering creates a new tenant (by design for SaaS, rate-limited, email-verified).
- For a single-tenant deployment this is an open door. Make it an env flag.

### M4. File access is broader than `files:view`
- `files.service.ts:100-107` (`assertCanAccess`): holders of `employees:view`, `recruitment:view` or `settings:view` (MANAGER, RECRUITER) can read any company file, and with `files:update`/`files:delete` modify or delete it.

### M5. Employee PII is not scoped
- `GET /employees/:id` (`employee.service.ts:151`, `employee.repository.ts:41-52`) returns full profile (emergency contacts, education, documents) to any `employees:view` holder, with no self/manager/department scoping.

### M6. Unbounded response on `GET /payroll/runs/:id`
- `payroll.repository.ts:56-62` (`runInclude`) loads all entries with nested payslips for the run. Verified by reading. Memory and latency grow with headcount.

### M7. Uncapped date ranges
- `GET /leave/calendar` (`leave.repository.ts:446`, `leave.service.ts:852`) and `GET /attendance/timesheet` (`attendance.repository.ts:409`, `attendance.service.ts:524`) accept arbitrary ranges. The export path (`reports.service.ts:442`) row cap **(unsure)**, `export-formatters.ts` was not reviewed.

### M8. Missing composite indexes
| Model (schema line) | Suggested index | Evidence |
|---|---|---|
| Employee (486-496) | `(companyId, departmentId)`, `(companyId, joinDate)`, optionally `(companyId, lastName, firstName)` | `dashboard.repository.ts:88-91,158`; `reports.repository.ts:341-414` (12 sequential counts); `employee.repository.ts:103-112` |
| StoredFile (1823-1828) | `(companyId, createdAt)` | `files.repository.ts:100` |
| Notification (1701-1705) | `(companyId, userId, channel, readAt)` or `(companyId, userId, createdAt)` | `notifications.repository.ts:156-208` (unread count likely polled) |
| Session (210-213) | `(userId, status)` | `auth.repository.ts:192`, `settings.repository.ts:141`, `profile.repository.ts:106`, `dashboard.repository.ts:14-21` |
| AiGeneration (1579-1583) | `(companyId, createdAt)`, `(companyId, feature, createdAt)` | `ai.repository.ts:424,448-451,498` |
| SalaryStructure (923-925) | `(companyId, isActive, effectiveFrom)` | `payroll.repository.ts:342-364` |
| Payslip (1055-1057) | `(employeeId, year, month)` | `payroll.repository.ts:641-643,719-731,746-751` |
| User.email (94) | functional unique on `lower(email)` | `settings.repository.ts:122` does `equals insensitive`; `auth.repository.ts:25` lowercases input only |

### M9. Data-integrity gaps in unique constraints
- `EmployeeKpi @@unique([employeeId, kpiId, year, quarter])` (line 1371): Postgres treats NULL `quarter` as distinct, so year-level rows can duplicate. `performance.repository.ts:~410-445` falls back to a non-atomic find-then-create. Add a partial unique index where `quarter IS NULL`.
- Unique keys ignore soft deletes (Branch, Department, Team, Designation, Shift, Holiday `(companyId,date)` line 676, LeaveType, PerformanceKpi, SalaryComponent, JobOpening, Candidate, Employee code/email, NotificationTemplate, PayrollRun `(companyId,year,month)` line 979). A soft-deleted row blocks reuse and surfaces a Conflict. Use partial unique indexes `WHERE "deletedAt" IS NULL` if reuse is desired.

## Low

- **L1** `GET /payroll/tax` calls `upsertTaxSetting` (`payroll.service.ts:388-395`), so a GET can write (verified). EMPLOYEE/MANAGER can read company tax and salary-component config (`payroll.routes.ts:31,82`).
- **L2** AI insights/recommendations/summary leak company-wide counts to EMPLOYEE (`ai:view`): `ai.service.ts:572,635`, `ai.repository.ts:181,448`.
- **L3** `GET /attendance/summary` and `/report` are company-wide for EMPLOYEE (`attendance.service.ts:261,714`).
- **L4** `ai.service.ts:740` `deleteGeneration` lacks the per-user scope that `getGeneration` applies (same-tenant authorization gap).
- **L5** `settings.repository.ts:121` + `settings.service.ts:405`: email-existence oracle across tenants via the conflict message.
- **L6** `dashboard.repository.ts:171-174`: `department.findMany({id in ...})` without `companyId`. Safe today (ids come from a scoped groupBy), add the filter anyway.
- **L7** `employee.repository.ts:242-272`: suspends/reactivates `employee.userId` with no check that the user belongs to the employee's company **(unsure)**. `User.companyId` is nullable.
- **L8** `employee.repository.ts:280-321`: `...data` spread into create/update; safe only if Zod validators are strict **(unsure, not verified)**.
- **L9** `utils/jwt.ts:52`: `verifyAccessToken` does not pin the algorithm **(unsure)**, likely harmless with a string secret.
- **L10** Other unbounded lists, small in practice: organization lists/chart (`organization.repository.ts:57,192,268,320,364`), `/leave/types`, `/attendance/shifts`, `/attendance/holidays` without `year`, notification templates/preferences/devices, `/global/bookmarks` (creation cap **(unsure)**), `/settings/roles`, `/settings/permissions`.
- **L11** Unverified: `integrations` JSON from `GET /settings/config` is not masked (does it hold secrets?); whether `users:update` (HR_MANAGER) can alter an HR_ADMIN account's status; whether `settings:view` exposes sensitive `/security/*` data.
- **L12** Redundant indexes (write cost, no read benefit): `@@index([companyId])` on Branch, Department, Team, Designation, Shift, Holiday, LeaveType, PerformanceKpi, Candidate, User (lines 291, 334, 358, 382, 658, 677, 776, 1348, 1173, 131); `BranchAllowedIp(branchId)` 308; `EmployeeSkill(employeeId)` 571; `EmployeeDocument(employeeId)` 610; `LeaveBalance(employeeId)` 815; `PayrollEntry(payrollRunId)` 1008; ~30 single-column `@@index([deletedAt])`; low-selectivity `status`-only indexes on User, AttendanceRecord, Payslip, Session; `PushDevice(isActive)`. Confirm no query uses `AiUsageLog(createdAt)` and `ReportExportLog(reportType|userId)` before dropping.
- **L13** Smaller composite candidates: LeaveRequest `(companyId, createdAt)` and `(companyId, employeeId, status, startDate)`; Interview `(companyId, scheduledAt)`; JobApplication `(companyId, stageChangedAt)`; AiMessage `(conversationId, createdAt)`; AiConversation `(companyId, userId, updatedAt)`; AttendanceRecord `(companyId, status, date)`; OvertimeRequest `(companyId, employeeId, date)`; NotificationTemplate `(companyId, category)`.
- **L14** `GET /health/ready` and `/health` are public and report DB state (normal for probes; excluded from the global rate limiter at `app.ts:79`).

---

## Route table (auth / RBAC / object-level)

Legend: CO = company-scoped lookup only; SELF = non-privileged users limited to own record; "router.use" = `authMiddleware` applied at router level. Every router except `auth` and `health` uses `router.use(authMiddleware)`. Prefix `/api/v1`. `authMiddleware` (`middleware/auth.middleware.ts:52-82`) verifies the bearer token, requires `sid`, and re-reads user and ACTIVE session from the database each request. `requirePermissions` (`middleware/rbac.middleware.ts:3-19`) requires ALL listed permissions.

### Public
| Method | Path | Auth | RBAC | Object-level | file:line |
|---|---|---|---|---|---|
| GET | /auth/status | public | none | n/a | `modules/auth/auth.routes.ts:24` |
| POST | /auth/register | public, rate-limited | none | n/a | `auth.routes.ts:26` |
| POST | /auth/login | public, rate-limited | none | n/a | `auth.routes.ts:32` |
| POST | /auth/refresh | public, rate-limited | none | n/a | `auth.routes.ts:38` |
| POST | /auth/forgot-password, /reset-password, /verify-email | public, rate-limited | none | n/a | `auth.routes.ts:44,50,56` |
| POST | /auth/mfa/verify | public (pre-auth step), rate-limited | none | n/a | `auth.routes.ts:62` |
| GET | /health/live, /health/ready, /health | public | none | n/a | `modules/health/health.routes.ts:20,34,54` |

### Authenticated
| Method | Path | RBAC permission | Object-level | file:line |
|---|---|---|---|---|
| GET | /auth/me | none (any user) | self | `auth.routes.ts:69` |
| POST | /auth/logout, /mfa/setup, /mfa/enable, /mfa/disable | none | self | `auth.routes.ts:70-83` |
| GET | /health/metrics | settings:view | n/a | `health.routes.ts:71` |
| GET | /dashboard/summary, /greeting, /notifications | dashboard:view | summary gated by `can()` | `modules/dashboard/dashboard.routes.ts:11-16` |
| GET | /dashboard/activity | dashboard:view | **company-wide (H2)** | `dashboard.routes.ts:11-16` |
| GET | /global/search, /shortcuts, /recent-searches | none at route; service gates by permission | per-user | `modules/global/global.routes.ts:18-25` |
| DELETE | /global/recent-searches[/:id] | none | SELF | `global.routes.ts:26-27` |
| GET/POST, PATCH/DELETE | /global/bookmarks[/:id] | none | SELF | `global.routes.ts:29-40` |
| GET | /security/status, /review, /policy, /login-attempts | settings:view | CO | `modules/security/security.routes.ts:18-43` |
| PATCH | /security/policy | settings:update | CO | `security.routes.ts:33` |
| GET/PATCH, POST, GET/PUT | /profile, /profile/password, /profile/preferences | none (self-service) | SELF | `modules/profile/profile.routes.ts:19-28` |
| GET, DELETE, POST | /profile/sessions[/:id], /revoke-others, /activity | none | SELF | `profile.routes.ts:34-38` |
| GET | /files/summary, /files | files:view | `visibilityScope` | `modules/files/files.routes.ts:16-17` |
| GET | /files/:id, /:id/download, /:id/preview | files:view | `assertCanAccess` (broad, M4) | `files.routes.ts:23,28,33` |
| POST | /files/upload | files:create (AVATAR exempt) | `assertCanAttach` | `files.routes.ts:46` |
| PATCH, DELETE | /files/:id | files:update, files:delete | `assertCanAccess` | `files.routes.ts:53,60` |
| GET | /employees, /employees/:id, /:id/timeline, /:id/activity | employees:view | CO (no self/manager scoping, M5) | `modules/employees/employees.routes.ts:30,31,54,59` |
| POST, PATCH, DELETE | /employees[/:id] | employees:create / update / delete | CO | `employees.routes.ts:36-48` |
| POST/PATCH/DELETE | /employees/:id/{emergency-contacts,education,experience,skills,certifications,documents}[/:subId] (18 routes) | employees:update | CO; sub-resource verified against employee | `employees.routes.ts:65-169` |
| GET | /attendance/summary, /report | attendance:view | CO company-wide (L3) | `modules/attendance/attendance.routes.ts:25-26` |
| GET | /attendance/timesheet, /me/today, /records[/:id], /overtime | attendance:view | SELF unless `attendance:update`/`approve` | `attendance.routes.ts:27-31,101` |
| POST | /attendance/records, /clock-in, /clock-out, /overtime | attendance:create | SELF; branch IP check on clock | `attendance.routes.ts:32,50,56,102` |
| PATCH, DELETE | /attendance/records/:id | attendance:update | CO | `attendance.routes.ts:38,44` |
| GET, POST/PATCH/DELETE | /attendance/shifts, /holidays | attendance:view / update | CO | `attendance.routes.ts:63-100` |
| POST | /attendance/overtime/:id/approve, /reject | attendance:approve | CO + self-review block only (H1) | `attendance.routes.ts:108,114` |
| GET | /leave/me/summary | leave:view | SELF | `modules/leave/leave.routes.ts:23` |
| GET | /leave/calendar, /report, /balances, /requests[/:id] | leave:view | SELF unless `leave:update`/`approve` (H1) | `leave.routes.ts:24,25,54,62,63` |
| GET, POST/PATCH/DELETE | /leave/types, /policy, /balances | leave:view / leave:update | CO | `leave.routes.ts:27-58` |
| POST, PATCH, POST | /leave/requests, /requests/:id, /:id/cancel | leave:create | SELF unless `canManageOthers` | `leave.routes.ts:68,74,92` |
| POST | /leave/requests/:id/approve, /reject | leave:approve | `assertCanReview`: no self-review, direct reports only | `leave.routes.ts:80,86` |
| GET/POST/PATCH/DELETE | /organization/* | organization:view / create / update / delete | CO | `modules/organization/organization.routes.ts:24-121` |
| GET | /payroll/summary, /report | payroll:view | `canManageCompanyWide` else self | `modules/payroll/payroll.routes.ts:23,29` |
| GET | /payroll/me/summary, /me/payslips | payroll:view | SELF | `payroll.routes.ts:24,135` |
| GET | /payroll/components, /tax | payroll:view | CO, readable by EMPLOYEE; GET /tax writes (L1) | `payroll.routes.ts:31,82` |
| POST/PATCH/DELETE | /payroll/components[/:id], PATCH /tax | create / update / delete | CO | `payroll.routes.ts:36-48,83` |
| GET, POST/PATCH/DELETE | /payroll/structures[/:id] | payroll:view / create / update / delete | SELF unless company-wide | `payroll.routes.ts:54-76` |
| GET | /payroll/runs[/:id], /runs/:id/entries | payroll:view | managers only; non-managers see own entries of APPROVED/PAID runs; unbounded include (M6) | `payroll.routes.ts:90,97,124` |
| POST, PATCH | /payroll/runs, /runs/:id, /:id/process | create / update | CO | `payroll.routes.ts:91,98,104` |
| POST | /payroll/runs/:id/approve, /mark-paid | payroll:approve | CO; cannot approve a run you processed | `payroll.routes.ts:109,114` |
| POST | /payroll/runs/:id/cancel | payroll:delete | CO | `payroll.routes.ts:119` |
| GET | /payroll/payslips[/:id] | payroll:view | SELF unless company-wide | `payroll.routes.ts:130,140` |
| GET/POST/PATCH/DELETE | /recruitment/* | recruitment:view / create / update / delete (offers respond: approve) | CO; foreign ids validated in company | `modules/recruitment/recruitment.routes.ts:29-218` |
| GET | /performance/summary, /me/summary, /report | performance:view | `canManageCompanyWide` (H1) | `modules/performance/performance.routes.ts:29-39` |
| GET | /performance/goals, /employee-kpis, /reviews, /promotions, /feedback (+ /:id) | performance:view | self, direct reports, reviewer; company-wide for approvers (H1) | `performance.routes.ts:45-212` |
| POST/PATCH/DELETE | /performance/* | create / update / delete | self or direct report; KPIs/cycles CO | `performance.routes.ts:50-234` |
| POST | /performance/reviews/:id/complete | performance:approve | CO only (H1) | `performance.routes.ts:173` |
| POST | /performance/promotions/:id/review | performance:approve | self-review and submitter blocks | `performance.routes.ts:228` |
| GET | /ai/status, /summary, /insights, /recommendations | ai:view | CO (L2) | `modules/ai/ai.routes.ts:37-49` |
| POST | /ai/insights, /recommendations, /assistant/chat, /resume-screening, /appraisals, /policies | ai:create, `aiRateLimiter` | chat own; screening needs recruitment perms; appraisal self or direct report | `ai.routes.ts:41-99` |
| GET | /ai/conversations[/:id], /generations[/:id] | ai:view | SELF unless `ai:delete` | `ai.routes.ts:62-112` |
| DELETE | /ai/conversations/:id, /generations/:id | ai:delete | CO (L4); conversation delete **(unsure)** | `ai.routes.ts:79,117` |
| GET, POST | /reports/summary, /attendance, /leave, /payroll, /recruitment, /performance, /employees, /exports, /export | reports:view (export: reports:export) | CO, no per-user scoping (H1) | `modules/reports/reports.routes.ts:15-64` |
| GET/PUT/POST/DELETE | /notifications/* (feed, inbox, preferences, devices, read) | notifications:view | SELF | `modules/notifications/notifications.routes.ts:23-120` |
| GET/POST/PATCH/DELETE | /notifications/templates, POST /send | notifications:manage | CO; recipient in same company | `notifications.routes.ts:63-103` |
| GET, PATCH | /settings/summary, /company, /config, /audit-logs | settings:view / update | CO | `modules/settings/settings.routes.ts:26-99` |
| GET, POST, PATCH, DELETE | /settings/users[/:id] | users:view / create / update / delete | CO; role-escalation and Super Admin guards | `settings.routes.ts:62-80` |
| GET, PUT | /settings/roles, /permissions, /roles/:id/permissions | roles:view / roles:manage | global tables; edit is Super Admin only (H5) | `settings.routes.ts:86-92` |

Routes with auth but no RBAC permission: `/auth/me|logout|mfa/*`, `/profile/*`, `/global/*`. All are self-scoped, which looks acceptable.

---

## Git history (secrets)

| Item | Result |
|---|---|
| `stale_token.txt` | Committed once in `bcd3c78` (2026-09-02, "new changes"), present on `origin/dev`, `origin/Review-the-app`, `origin/leave_management_phase`, `origin/payroll-managements`, `origin/phase-12`, `origin/phase_6`. It is now untracked and listed in `.gitignore`. Content (166 bytes, UTF-16) is a single `dotenvx` banner line (`injected env (13) from .env`). **No token or secret in it.** Severity Low. |
| `.env`, `.env.production` | Not in history (ignored). Only `.env.example` and `.env.production.example` appear. |
| Secret-pattern scan of all commits (private keys, AWS keys, JWTs, `sk-` keys, `*_SECRET=`, `*_API_KEY=`, `MFA_ENCRYPTION_KEY=`, `POSTGRES_PASSWORD=`) | Only placeholder values (`CHANGE-ME-…`, `replace-with…`, empty) in commits `4f82b91`, `b3a41c9`, `e1675c9`. No real secret found. |
| Limits | Pattern-based scan, so a differently formatted secret could be missed. Remote forks/clones were not inspected. `prisma/seed-qa.fixtures.json` is gitignored, untracked and was never committed (checked with `git ls-files` and `git log --all`). |

Recommendation: `git rm --cached` is unnecessary for `stale_token.txt`. Delete the local file. Rewriting history is not warranted given the content.

---

## Phased implementation plan (smallest safe steps)

**Phase 0: verify (no code change).** Confirm H5 (can any tenant owner get SUPER_ADMIN?), confirm what `integrations` stores. Delete local `stale_token.txt`.

**Phase 1: close the leaks (small, independent, each with a test).**
1. H2: gate or scope `/dashboard/activity`.
2. L1: make `getTax` read-only (no upsert on GET); restrict `/payroll/tax` and `/payroll/components` reads to payroll managers.
3. L2/L3: scope AI insights/summary and attendance summary/report to users with the manager/admin permission.
4. M3: add an env flag for self-registration.

**Phase 2: manager scoping (design decision first).** Choose between a new `*:company` permission or scoping reads to direct reports, then apply to performance, leave, attendance, overtime approval, reports (H1). Add the files and employee-PII scoping (M4, M5) afterwards. This changes behavior, so it needs product sign-off.

**Phase 3: tenant hardening, mechanical.**
1. M1: change by-id writes to `updateMany({where:{id, companyId}})` module by module (one commit per module, run the module tests).
2. L6, L4, L7: add the missing `companyId`/user filters.

**Phase 4: indexes (one migration per step, `CREATE INDEX CONCURRENTLY` where possible).**
1. M8 composites (Employee, StoredFile, Notification, Session, AiGeneration, Payslip, SalaryStructure).
2. H3: add `AuditLog.companyId` (nullable, backfill from actor, then index).
3. H4: `pg_trgm` + GIN indexes.
4. M9: partial unique indexes (EmployeeKpi quarter NULL; soft-delete-aware uniques). Check existing data for duplicates first.
5. L12: drop redundant indexes last, after confirming with `pg_stat_user_indexes` in a real environment.

**Phase 5: bounds.** Paginate or cap `GET /payroll/runs/:id` entries (M6); cap date ranges on calendar and timesheet (M7); confirm the export row cap; add pagination to the small unbounded lists only if they grow.

Suggested validation per phase: `npm run lint` and `npm test`; for Phase 4, run `EXPLAIN (ANALYZE)` on the cited queries before and after against seeded QA data.
