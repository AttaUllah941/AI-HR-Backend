# Zenith HR — Full Project Overview (Frontend + Backend)

Zenith is an enterprise HR platform covering the employee lifecycle from hiring to payroll, with an AI assistant ("Nova").

**Last updated:** 2026-11-26. This document comes from reading both repositories, the production deployment of 2026-11-20, and a module-by-module UI review and rework of the frontend. Each section says what was checked and what was not. Nothing here is evidence of compliance or certification.

---

## 1. Repositories

| Part | Repo | Local path | Branch with deployment work |
|---|---|---|---|
| Backend | `AttaUllah941/AI-HR-Backend` | `AI-HR-Backend` | `deployment/production-setup` |
| Frontend | `AttaUllah941/AI-HR-Frontend` | `AI-HR-Frontend/AI-HR-Frontend` | `deployment/production-setup` |

Default branch for PRs is `dev`. Both repos also have `main` and several phase branches.

**Uncommitted work:** the frontend working tree holds all the UI changes described in section 5 (Organization through Profile, plus shared pieces). They are not committed or pushed. The backend was only read during this review and has no new edits.

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

### Verified on production (2026-11-20)
- Docker build on Railway, API start, `/api/v1/health/live` and `/health/ready` (database up).
- All Prisma migrations of that date applied (22 then; the repo now has 23, see section 3).
- CORS allows the Vercel origin and rejects a foreign origin.
- Protected route without token returns 401.
- Nested Angular route (`/employees`) returns 200; `/api/*` through Vercel reaches Railway.
- Login of the bootstrapped admin returns an access token.

### Not verified
- The new frontend UI work (section 5) has **not** been deployed or tested against production.
- Cloudinary upload and private file retrieval.
- Logout, token refresh, browser-refresh persistence, MFA.
- Email delivery (see section 6).

### Known limitations
- `EMAIL_PROVIDER=console` with `ALLOW_CONSOLE_EMAIL=true`: reset, verification and invitation emails go to server logs only. Set up a mail relay before real users.
- `TRUST_PROXY=2` is an assumption (Vercel rewrite + Railway edge). Confirm the real client IP appears in logs; it affects per-IP rate limits and branch/company IP allowlists.
- The frontend commit that sets the Railway domain in `vercel.json` existed locally only at the time of writing (push failed on GitHub credentials).
- `prisma/bootstrap-admin.mjs` was untracked at the time of writing.

---

## 3. Backend

**Stack:** Node 22, Express 5, TypeScript, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Zod 4, JWT, bcryptjs, otplib (TOTP MFA), pino, prom-client, Cloudinary SDK, exceljs, multer.

### Layout
```
src/
  app.ts, server.ts       app factory and entry
  config/                 env (Zod-validated), database, logger, metrics
  middleware/             auth, rbac, tenant, validate, idempotency, rate limit, request id/timeout, error, metrics, lookup cache
  modules/                feature modules (controller -> service -> repository, Zod validators)
  routes/index.ts         aggregates routes under /api/v1 (and /companies/:companyId/* tenant aliases)
  services/               email, storage (local/cloudinary), push
  utils/                  jwt, password, mfa, secret-box (AES-256-GCM), cursor pagination, ip-matcher
  docs/                   OpenAPI generator + Swagger UI (never in production)
prisma/                   schema.prisma (69 models), 23 migrations, seed.ts, seed-qa.ts, bootstrap-admin.mjs
docs/                     DEPLOYMENT.md, PRODUCTION.md, audit/AUDIT.md, this file
```

### Modules
`ai`, `attendance`, `auth`, `dashboard`, `employees`, `files`, `global` (search), `health`, `leave`, `notifications`, `organization`, `payroll`, `performance`, `platform`, `profile`, `recruitment`, `reports`, `security`, `settings`.

### Data model (69 models, 23 migrations)
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

(The list above is the grouping from the earlier read-through; the model count of 69 was counted from `schema.prisma` on 2026-11-26, so two models are not in the list.)

### Multi-tenancy
Every module is mounted at `/api/v1/<module>` and again at `/api/v1/companies/:companyId/<module>`. The second mount only works when `:companyId` is the caller's own company (id or slug); otherwise 403. `authMiddleware` also rejects an `X-Company-Slug` header that does not match the user's company, and a deactivated company locks out all its users immediately.

### Auth and RBAC
- Access and refresh JWTs. A token without a session id is rejected, so sessions are revocable. The user and active session are re-read from the database on every request.
- Accounts that are suspended, deleted, unverified or locked are refused.
- Permissions are `module:action`: 15 modules x 7 actions (view, create, update, delete, approve, export, manage).
- **Roles:** SUPER_ADMIN, HR_ADMIN, HR_MANAGER, RECRUITER, MANAGER, EMPLOYEE (company roles), plus **PLATFORM_SUPER_ADMIN** (no company; used under `/platform` to manage tenants).
- **Role definitions are shared by all companies.** `PUT /settings/roles/:id/permissions` always returns 403; only `PUT /platform/roles/:id/permissions` (platform admin) can change them.
- MFA (TOTP) secrets are encrypted at rest (`MFA_ENCRYPTION_KEY`, AES-256-GCM).
- Route files without the permission middleware: `auth`, `global`, `profile`. `auth` and `profile` are self-scoped. `global` search filters each result type by the caller's permissions in its service, and limits files to the caller's own uploads for non-staff.

### Security and hardening
helmet (strict CSP in production), CORS allowlist, global and auth-specific rate limits, request id, 1 MB body limit, request timeout (default 30 s), idempotency keys, `/metrics` off by default (token or private network), OpenAPI docs disabled in production. Production start-up refuses weak or identical JWT secrets, a missing `MFA_ENCRYPTION_KEY`, `console` email (unless `ALLOW_CONSOLE_EMAIL=true`) and Cloudinary without its credentials. AI provider payloads are scrubbed of email, phone and address fields before being sent or stored (names are kept).

### Scripts
| Command | Purpose |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run build` / `npm start` | Compile / run `dist/server.js` |
| `npm run lint` | Typecheck (`tsc --noEmit`); passed on 2026-11-26 |
| `npm test` | Node test runner: 111 tests passing on 2026-11-26 (database tests are skipped unless `RUN_DB_TESTS=1`, so they were **not** run) |
| `npm run prisma:migrate` / `prisma:seed` | Dev migrations / demo seed |
| `npm run db:up` | Embedded PostgreSQL for local development |

### Environment variables (names only, set in Railway)
`NODE_ENV`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_KEY`, `CORS_ORIGIN`, `APP_URL`, `TRUST_PROXY`, `FILE_STORAGE_PROVIDER`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `EMAIL_PROVIDER`, `ALLOW_CONSOLE_EMAIL`, `AI_PROVIDER`, `ALLOW_SELF_REGISTRATION`. Optional: `EMAIL_SMTP_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `RATE_LIMIT_*`, `DB_POOL_*`, `METRICS_*`. `PORT` is injected by Railway. Never commit values.

---

## 4. Frontend

**Stack:** Angular 21 (standalone components, signals, OnPush), Angular Material/CDK, ECharts, date-fns, qrcode, RxJS, Vitest.

### Layout (`src/app`)
```
core/        guards, interceptors, services (one per backend domain), models, utils (date-format, table-prefs, ttl-cache), validators
features/    lazy-loaded areas, each with a *-shell page, pages/, dialogs/ and a styles partial
layouts/     main-layout (shell, sidebar, header, bottom nav, notification bell, user menu), auth-layout
shared/      page-header, breadcrumb, empty-state, confirm-dialog, skeleton, charts (themed ECharts host), forms, utils
```
Feature areas: auth, dashboard, organization, employees, attendance, leave, payroll, recruitment, performance, ai, reports, notifications, profile, search, settings, files (shown in the app as "Documents"). Each is gated by `permissionGuard('<module>:view')` except profile and search.

### Auth flow
Login returns user and tokens (or an MFA challenge). `authInterceptor` adds the Bearer token. `refreshInterceptor` performs one shared refresh on a 401 and retries. "Remember me" chooses `localStorage` or `sessionStorage`. `returnUrl` is sanitised against open redirects. Tokens in web storage are exposed to XSS; an httpOnly refresh cookie would be stronger.

### API base URL
Development: `http://localhost:3000/api/v1`. Production: `/api/v1`, proxied by Vercel to Railway through the rewrite in `vercel.json`.

### Build, tests, size (checked 2026-11-26)
- `npm run build` succeeds. Initial bundle **694 kB** (warning budget 660 kB, error budget 800 kB). It was 671 kB before the UI work; the growth is mostly shared global styles. Two component stylesheets also exceed their 6 kB warning (Employees list, Notifications inbox).
- `ng test`: **42 files, 240 tests, all passing** (re-run after the review fixes in section 10). One older Reports test is timing-sensitive on a busy machine, so its timeout was raised to 15 s.
- Not done: visual checks in a browser, dark mode, phone widths, and runs against a real API for the reworked pages.

---

## 5. Frontend UI work (2026-11-26)

Each module below was read in full, checked against what the backend really does, then reworked. All changes are uncommitted.

### Shared conventions introduced
- **No skeleton flash:** pages keep their content on screen while refetching (a `loaded` signal passed as `hasData`), so filters, search boxes and forms are never replaced mid-use.
- **Lists:** one pattern across Organization, Documents, Settings and others: search pill, filters, sortable or paged table, readable status pills (text plus dot, not colour alone), per-row actions with descriptive `aria-label`s, stacked cards on phones. Server-side paging reuses the shared footer.
- **Shared code:** `OrgList` (client-side search/sort/paging), `OrganizationListToolbar/Footer`, `shared/forms/person-picker.ts` (searchable employee/candidate/user pickers, replaces raw ID inputs), `shared/forms/validators.ts` (IP/CIDR, timezone, locale), `shared/utils/markdown.ts` (safe renderer for AI text: escapes everything, no links or raw HTML), `shared/utils/text.ts` (`HR_ADMIN` -> "HR Admin", initials).
- **Dark mode:** hardcoded pastel colours in the Reports, AI, Settings and Profile stylesheets and the Reports chart were replaced with theme tokens; the Reports chart now uses the shared themed chart host.
- **Honest copy:** screens now say when a setting is only stored and not enforced (see section 6).
- **Responsible AI:** AI output (policy drafts, screenings, appraisals, recommendations, chat) carries a note that it is a draft to be reviewed by a person.

### By module
| Module | Main changes |
|---|---|
| Organization | Card lists became searchable, sortable, paged tables with Active/Inactive status; dialogs gained an Active checkbox and show the server's error message; Overview loading placeholder fixed |
| Documents | Search no longer loses focus while typing; server-side paging; "no matching" vs "none yet" states; preview opens without pop-up blocking; upload dialog has searchable employee/candidate pickers, keyboard-accessible drag-and-drop and a size check |
| Policies (AI) | Drafts render as a formatted document; Copy and Download; review notice; history is an accessible list; no page flash after generating |
| Reports | No flash on filter/export; themed accessible chart with value labels and empty state; Attendance range validation, presets and hours display; fixed UTC "today" bug; older payroll years selectable; export banner no longer shifts the page |
| Notifications | Inbox filter stability, select-all, quiet refresh; Send dialog has a recipient picker and no test text by default; Preferences shows unsaved state and a warning when Security alerts are fully off; per-item button labels |
| AI Assistant | Chat: delete reachable by keyboard, formatted replies, starter prompts, copy, race-condition fixes; Screening/Appraisals show who each result is for; run dialogs use searchable pickers; tabs follow permissions |
| Settings | Users paged with readable status/roles, MFA column, self-delete blocked, temporary password with Copy; Roles is a read-only view; Company asks before deactivating; Security validates the IP allowlist and warns before a restrictive one is saved; Audit paged; Email/Storage/System state what is not enforced |
| Profile | Identity header; Overview validation; Security with live password-match feedback and show/hide; Sessions ordered with sign-out-others only when relevant; Preferences states that only the theme applies; Activity notes the 50-event limit |

Dashboard and Employees were reworked before this review (sticky headers, density and column visibility, saved filters, mobile cards, accessibility fixes) and were used as the reference pattern. Their changes were not made or re-verified in this review.

---

## 6. Things the UI can show but the backend does not (yet) act on

Found by tracing each setting in the backend. The reworked screens now say so; the underlying behaviour is unchanged.

| Setting | What actually happens |
|---|---|
| Settings > Email (provider, SMTP/relay URL, From) | Saved to the database only. Sending uses the server environment (`EMAIL_PROVIDER`, `EMAIL_SMTP_URL`, `EMAIL_FROM`, `EMAIL_API_KEY`). The "smtp" provider is an **HTTP relay** that receives JSON, not a real SMTP connection. |
| Settings > Storage (provider, bucket, region) | Recorded only. Uploads go where `FILE_STORAGE_PROVIDER` says (local or Cloudinary). The files summary's `runtimeProvider` is hardcoded to `local`. |
| System > Maintenance mode | Stored flag; nothing reads it. |
| System / Security > Allow self-registration | Not read by sign-up. Registration is decided by `ALLOW_SELF_REGISTRATION` and a built-in default. |
| Integrations (Slack webhook, Google, Microsoft) | Stored, unused. The Slack webhook URL is stored and returned in plain text to anyone who can view settings. |
| Security > Refresh rate limit | Stored; the limiter uses the platform default. |
| Profile > locale, timezone, date format, time format, week start | Saved per user; the app uses fixed display formats. Only the theme is applied. |
| Settings > Roles (edit permissions) | Company-level edits are rejected with 403; only the platform administrator can change roles. |
| User status "Inactive" | Was not blocked at sign-in (it only revoked sessions). Fixed 2026-11-26: Inactive is now refused at login, MFA, refresh and on every request. |
| Security > IP allowlist | Enforced at sign-in for everyone in the company. If a stored list cannot be parsed, sign-in treats it as "allow all" (fails open). The UI now validates entries and warns before saving. |

---

## 7. Admin account and users
- Production has one user: a SUPER_ADMIN created by `prisma/bootstrap-admin.mjs` with a generated password. Change the password and enable MFA after first login.
- Self-registration is off (`ALLOW_SELF_REGISTRATION=false`); add users from the app.
- `prisma/seed.ts` creates `superadmin@zenith.local` and `admin@zenith.local` with a fixed, well-known password and demo data. **Do not run it on production.**

---

## 8. Audit status (`docs/audit/AUDIT.md`, written earlier)
Spot-checked on 2026-11-26 against current code:
- **Fixed:** H2 (`/dashboard/activity` now scoped), L1 (`GET /payroll/tax` is read-only), M3 (self-registration is an env flag), H5 (role edits moved to the platform administrator).
- **Fixed in the 2026-11-26 review:** L9 (the JWT algorithm is now pinned to HS256).
- **Not re-checked, assume open:** H1 (managers treated as company-wide through `*:approve`), M1/M2 (by-id writes and single-column foreign keys), M4/M5 (file and employee-PII scoping), the index and unique-constraint items (H3, H4, M8, M9).

---

## 10. End-to-end review (2026-11-26)

**Method and limits.** Seven reviewers traced each module read-only, from the UI through the frontend service, route, middleware, Zod validator, service and repository to Prisma, and back. I then re-checked a subset of their findings in the code before changing anything. This is **static code review**. Not verified: anything needing a browser (rendering, responsive widths, dark mode, keyboard focus), a live API, the deployed database or production. Seed role grants were read from `prisma/rbac.ts` and `prisma/seed.ts`; roles in a deployed database may differ. Dashboard and Employees were reviewed for logic only; their UI was not re-checked. Findings marked "reviewer only" were **not** re-verified by me.

### Fixed in this pass (each checked in the code first; backend 111/111 and frontend 240/240 tests pass)
| Area | Fix |
|---|---|
| Auth | JWT algorithm pinned to HS256 on sign and verify |
| Auth | An unknown or inactive-company email now spends the same bcrypt time as a real login, so response time no longer reveals which emails exist |
| Auth | `INACTIVE` users are refused at login, MFA, refresh and in the auth middleware (the Users screen offered "Inactive" but it did nothing) |
| Auth | Email verification only activates a `PENDING_VERIFICATION` account; it no longer reactivates one an admin has since suspended |
| Attendance | The list's search term no longer overwrites the department filter |
| Files | The summary reports the storage provider the server really uses (it was hardcoded `local`); removed a no-op block |
| Organization | A code of only spaces is rejected (it was stored as empty) |
| Profile | `avatarUrl` accepts only `https://` or a single-slash path. `javascript:`, `data:`, `ftp:`, `http:` and `//host/...` were accepted before. A first version of this fix threw on relative paths; a test caught it and it was corrected |
| Frontend | "Today" defaults use the local date in six attendance and leave screens (they used the UTC date) |
| Frontend | The Employees filter offers Notice period, Terminated and Resigned |
| Frontend | Employee detail cancels the previous employee's requests, so a slow response cannot overwrite the page |
| Frontend | Search saves a "recent" entry only on an explicit search, not for every typed prefix |
| Frontend | Clearing an optional field in an employee sub-form now clears it (it was silently ignored) |

### Open: need a product or security decision (not changed)
**High**
1. **Manager scope (audit H1).** Still true for attendance (records, timesheets and overtime approval are company-wide), performance (any manager can read all reviews and feedback and complete any review, including their own), reports (managers see company-wide payroll totals), files (anyone with `employees:view` can read every company file) and employee detail (a recruiter or manager can read HR notes and date of birth for anyone). Leave is already scoped correctly.
2. **Attendance can be self-written.** `POST /attendance/records` needs only `attendance:create`, so an employee can create a full present day for any date from anywhere, bypassing the branch IP check.
3. **Attendance time zones.** Day boundaries and shift times are UTC; the company time zone is stored but unused, so late and overtime are wrong for non-UTC companies.
4. **Recruitment has no stage machine.** A rejected candidate can be moved to hired, hired can go back, and a recruiter can hire without an offer. Accepting an offer overrides any application state. The job and interview update schemas let `status` be written directly.
5. **Performance.** Reviews stay editable after submit and acknowledgement.
6. **Company deactivation.** A tenant admin can deactivate their own company (only the platform administrator can undo it). The UI now asks first, but the API accepts it.
7. **IP allowlist.** It fails open if a stored list cannot be parsed, is checked only at login (not at MFA or refresh), and nothing stops an admin saving a list that excludes their own network. Failing closed has a lockout cost, so it needs a decision.
8. **HR_MANAGER can suspend or re-role an HR_ADMIN** (the guards cover only SUPER_ADMIN targets). Reviewer only.
9. **Role grants.** MANAGER has no `leave:create` or `attendance:create`, so managers cannot request their own leave or clock in unless they hold a second role.

**Medium**
- Payroll: an empty run (no employee has a salary structure) can be processed, approved and paid; a cancelled run blocks that month forever; run responses load every entry (audit M6); money is stored as floating point; no proration for mid-month joiners; `payroll:export` is defined but unused.
- Leave: `updateRequest` is not scoped to the manager's team and can drift the pending balance under concurrent edits; terminated employees are not excluded.
- Recruitment and performance: no past-date, overlap or amount checks on interviews and offers; offers never expire; duplicate reviews per cycle; KPI uniqueness with a NULL quarter (audit M9); no employee-status checks.
- AI: anyone with `ai:delete` (recruiters) can read every user's appraisal generations; the model's screening score is written straight into the candidate record; no daily or token budget; company-wide counts are visible to every role with `ai:view`; a missing `AI_API_KEY` silently falls back to the mock provider.
- Auth and sessions: register returns "already exists" (email enumeration); MFA codes can be replayed within their window; MFA enable and change-password have no per-account throttle; a second browser tab can wipe a remembered session after the first rotates the token.
- Settings: `integrations` JSON (including the Slack webhook) is returned unmasked; role `userCount` counts users across all tenants; the platform API writes no audit rows; the user edit dialog always sends roles, so renaming someone signs them out and is refused for yourself or a higher role.
- Dashboard: company-wide attendance, leave, payroll and rating figures are shown to every role with the matching view permission.
- Search: results beyond 30 are unreachable and the counts reflect the truncated list.
- Uploads: file delete leaves dangling document, resume and avatar links; a failed database write leaves an orphaned blob; a file's category can be changed into AVATAR, RESUME or EMPLOYEE_DOCUMENT; avatars uploaded through Files cannot render in an `<img>` because the preview route needs a bearer token.

**Low:** organization unique codes ignore soft delete; IPv6 allowlist matching compares strings; employee and user emails stay reserved after soft delete; pickers load only the first 100 people; the frontend has several validation gaps against the Zod limits; push device tokens are not released from a previous user.

**Conflicting reviewer findings, unresolved:** the dashboard reviewer says employee and file audit rows never get a `companyId`; the settings reviewer says a database trigger (migration `20261108000000_perf_indexes`) fills it from the actor. Check in a real database before acting.

## 9. Recommended next steps
1. Commit the frontend and backend work in reviewable chunks, run the app in a browser (light, dark, phone width) and against a real API, then deploy to a preview first. Decide the items in the first two groups of section 10.
2. Test a Cloudinary upload and download as the admin and confirm the asset type is `authenticated`.
3. Rotate the Cloudinary API secret if it is still the one shared in chat.
4. Set up the mail relay and switch `EMAIL_PROVIDER`; remove `ALLOW_CONSOLE_EMAIL`. Until then no one receives resets or invitations.
5. Make the settings in section 6 either real (read the stored values) or remove them, and decide whether the Slack webhook should be stored at all.
6. Fix the allowlist fail-open and pin the JWT algorithm in the backend.
7. Decide manager scoping (H1) and apply it, then work through the remaining audit items.
8. Verify `TRUST_PROXY` against the real client IP in logs.
9. Plan database backups (Railway volume is 500 MB) and monitoring.
10. Re-run the backend tests (`npm test`), and add component tests for the permission guard and the tenant guard.
11. Reduce the frontend bundle growth (shared global styles) before it nears the 800 kB error budget.
