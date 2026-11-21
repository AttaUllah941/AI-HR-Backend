# Zenith HR — Full Project Overview (Frontend + Backend)

Zenith is an enterprise HR platform covering the employee lifecycle from hiring to payroll, with an AI assistant ("Nova").
This document was written from a read-through of both repositories and the production deployment done on 2026-11-20.
It records what was checked and what was not.

---

## 1. Repositories

| Part | Repo | Local path | Branch with deployment work |
|---|---|---|---|
| Backend | `AttaUllah941/AI-HR-Backend` | `AI-HR-Backend` | `deployment/production-setup` |
| Frontend | `AttaUllah941/AI-HR-Frontend` | `AI-HR-Frontend/AI-HR-Frontend` | `deployment/production-setup` |

Default branch for PRs is `dev`. Both repos also have `main` and several phase branches.

---

## 2. Production deployment

```
Browser -> Vercel (Angular SPA) --/api/* rewrite--> Railway (Express API) --private network--> Railway PostgreSQL
                                                                   \--> Cloudinary (private files)
```

| Component | Platform | Location |
|---|---|---|
| Frontend | Vercel (project `zenith-hr`) | https://zenith-hr-liart.vercel.app |
| API | Railway (project `zenith-hr`, service `api`, built from `Dockerfile`) | https://api-production-f3971000.up.railway.app |
| Database | Railway PostgreSQL | `postgres.railway.internal` (private) |
| Files | Cloudinary | Backend uploads as `authenticated` assets |

### Verified on production
- Docker build on Railway, API start, `/api/v1/health/live` and `/health/ready` (database up).
- All 22 Prisma migrations applied.
- CORS allows the Vercel origin and rejects a foreign origin.
- Protected route without token returns 401.
- Nested Angular route (`/employees`) returns 200; `/api/*` through Vercel reaches Railway.
- Login of the bootstrapped admin returns an access token.

### Not verified
- Cloudinary upload and private file retrieval.
- Logout, token refresh, browser-refresh persistence, MFA.
- Email delivery (see limitations).

### Known limitations
- `EMAIL_PROVIDER=console` with `ALLOW_CONSOLE_EMAIL=true`: reset and verification emails go to server logs only. Set up SMTP before real users.
- `TRUST_PROXY=2` is an assumption (Vercel rewrite + Railway edge). Confirm the real client IP appears in logs.
- The frontend commit that sets the Railway domain in `vercel.json` exists locally only (push failed on GitHub credentials).
- `prisma/bootstrap-admin.mjs` is untracked.

---

## 3. Backend

**Stack:** Node 22, Express 5, TypeScript, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Zod 4, JWT, bcryptjs, otplib (TOTP MFA), pino, prom-client, Cloudinary SDK, exceljs, multer.

### Layout
```
src/
  app.ts, server.ts       app factory and entry
  config/                 env (Zod-validated), database, logger, metrics
  middleware/             auth, rbac, validate, idempotency, rate limit, request id/timeout, error, metrics, lookup cache
  modules/                18 feature modules (controller -> service -> repository, Zod validators)
  routes/index.ts         aggregates routes under /api/v1
  services/               email, storage (local/cloudinary), push
  utils/                  jwt, password, mfa, secret-box (AES-256-GCM), cursor pagination, ip-matcher
  docs/                   OpenAPI generator + Swagger UI (never in production)
prisma/                   schema.prisma (67 models), 22 migrations, seed.ts, seed-qa.ts, bootstrap-admin.mjs
docs/                     DEPLOYMENT.md, PRODUCTION.md, audit/AUDIT.md, this file
```

### Modules
`ai`, `attendance`, `auth`, `dashboard`, `employees`, `files`, `global` (search), `health`, `leave`, `notifications`, `organization`, `payroll`, `performance`, `profile`, `recruitment`, `reports`, `security`, `settings`.

### Data model (67 models)
- **Identity and security:** Company, User, Role, Permission, RolePermission, UserRole, Session, PasswordResetToken, EmailVerificationToken, AuditLog, LoginAttempt, CompanySecurityPolicy, UserPreference, IdempotencyKey
- **Organization:** Branch, BranchAllowedIp, Department, Team, Designation
- **Employees:** Employee, EmergencyContact, Education, Experience, Skill, Certification, Document
- **Attendance:** Shift, Holiday, AttendanceRecord, OvertimeRequest
- **Leave:** LeaveType, LeavePolicy, LeaveBalance, LeaveRequest
- **Payroll:** SalaryComponent, SalaryStructure, SalaryStructureItem, TaxSetting, PayrollRun, PayrollEntry, PayrollEntryLine, Payslip
- **Recruitment:** JobOpening, Candidate, JobApplication, Interview, JobOffer
- **Performance:** PerformanceGoal, PerformanceKpi, EmployeeKpi, ReviewCycle, PerformanceReview, PerformanceFeedback, PromotionRequest
- **AI:** AiUsageLog, AiConversation, AiMessage, AiGeneration
- **Platform:** ReportExportLog, NotificationTemplate, Notification, NotificationPreference, PushDevice, CompanySettings, StoredFile, SearchBookmark, RecentSearch

### Auth and RBAC
- Access and refresh JWTs. A token without a session id is rejected, so sessions are revocable.
- Accounts that are suspended, deleted, unverified or locked are refused.
- Permissions are `module:action`. 15 modules x 7 actions (view, create, update, delete, approve, export, manage) = 105.
- **6 roles:** SUPER_ADMIN, HR_ADMIN (all except `roles:manage`), HR_MANAGER, RECRUITER, MANAGER, EMPLOYEE.
- MFA (TOTP) secrets are encrypted at rest (`MFA_ENCRYPTION_KEY`, AES-256-GCM).
- Route files without the permission middleware: `auth`, `global`, `profile`. Auth and profile are likely intentional; check that `global` search filters by the user's permissions.

### Security and hardening
helmet (strict CSP in production), CORS allowlist, global and auth-specific rate limits, request id, 1 MB body limit, request timeout (default 30s), idempotency keys, `/metrics` off by default (token or private network), OpenAPI docs disabled in production. Production start-up refuses weak/identical JWT secrets, a missing `MFA_ENCRYPTION_KEY`, `console` email (unless `ALLOW_CONSOLE_EMAIL=true`) and Cloudinary without its credentials.

### Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run build` / `npm start` | Compile / run `dist/server.js` |
| `npm run lint` | Typecheck (`tsc --noEmit`) |
| `npm test` | Node test runner (89 tests passing at last run) |
| `npm run prisma:migrate` / `prisma:seed` | Dev migrations / demo seed |
| `npm run db:up` | Embedded PostgreSQL for local development |

### Environment variables (names only, set in Railway)
`NODE_ENV`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_KEY`, `CORS_ORIGIN`, `APP_URL`, `TRUST_PROXY`, `FILE_STORAGE_PROVIDER`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `EMAIL_PROVIDER`, `ALLOW_CONSOLE_EMAIL`, `AI_PROVIDER`, `ALLOW_SELF_REGISTRATION`. Optional: `EMAIL_SMTP_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `RATE_LIMIT_*`, `DB_POOL_*`, `METRICS_*`. `PORT` is injected by Railway. Never commit values.

---

## 4. Frontend

**Stack:** Angular 21 (standalone components, signals), Angular Material/CDK, ECharts, qrcode, RxJS, Vitest.

### Layout (`src/app`)
```
core/        guards (auth, permission, unsaved-changes), interceptors (auth, refresh, error, loading),
             services (one per backend domain), models, routing (preloading), utils, validators
features/    16 lazy-loaded areas, each with a *-shell page, pages/ and dialogs/
layouts/     main-layout (shell, sidebar, header, bottom nav, notification bell, user menu), auth-layout
shared/      page-header, breadcrumb, empty-state, confirm-dialog, skeleton, smart-loader
```

### Feature areas
auth, dashboard, organization, employees, attendance, leave, payroll, recruitment, performance, ai, reports, notifications, profile, search, settings, files. Each is gated by `permissionGuard('<module>:view')` except profile and search (authenticated only).

### Auth flow
Login returns user and tokens (or an MFA challenge). `authInterceptor` adds the Bearer token. `refreshInterceptor` performs one shared refresh on a 401 and retries. "Remember me" chooses `localStorage` or `sessionStorage`. `returnUrl` is sanitised against open redirects. Tokens in web storage are exposed to XSS; an httpOnly refresh cookie would be stronger.

### API base URL
Development: `http://localhost:3000/api/v1`. Production: `/api/v1`, proxied by Vercel to Railway through the rewrite in `vercel.json`.

### Build and deploy
`npm run build` outputs `dist/zenith-hr/browser` (built without errors; one non-blocking warning that `qrcode` is not ESM). `vercel.json` sets the SPA fallback to `/index.html`, the API rewrite, and security headers including a strict CSP.

### Tests
About 12 spec files for roughly 549 source files (auth, interceptors, a few services). No component tests.

---

## 5. Admin account and users
- Production has one user: a SUPER_ADMIN created by `prisma/bootstrap-admin.mjs` with a generated password. Change the password and enable MFA after first login.
- Self-registration is off (`ALLOW_SELF_REGISTRATION=false`); add users from the app.
- `prisma/seed.ts` creates `superadmin@zenith.local` and `admin@zenith.local` with a fixed, well-known password and demo data. **Do not run it on production.**

---

## 6. Recommended next steps
1. Test a Cloudinary upload and download as the admin, and confirm the asset type is `authenticated` in the Cloudinary console.
2. Rotate the Cloudinary API secret if it is still the one shared in chat.
3. Set up SMTP and switch `EMAIL_PROVIDER` to `smtp`; remove `ALLOW_CONSOLE_EMAIL`.
4. Fix the GitHub credential so the `vercel.json` commit can be pushed; consider connecting Vercel and Railway to GitHub for auto-deploys.
5. Verify `TRUST_PROXY` against the real client IP in logs.
6. Review the `global` search route for permission filtering.
7. Plan database backups (Railway volume is 500 MB) and monitoring.
8. Add frontend component tests, especially for the permission guard.
