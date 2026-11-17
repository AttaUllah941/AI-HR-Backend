# Zenith HR: Production Deployment (Vercel + Railway + Cloudinary)

```
Users -> Vercel (Angular SPA) -- /api/* rewrite --> Railway (Express API) --> Railway PostgreSQL
                                                                       \--> Cloudinary (files)
```

Accounts: GitHub `AttaUllah941` (repos `AI-HR-Frontend`, `AI-HR-Backend`). Never commit secrets. Every value below
is set in the provider dashboards, not in Git.

## 1. Database: Railway PostgreSQL
1. Railway project -> New -> Database -> PostgreSQL.
2. Do not enable a public TCP proxy unless you need to run something from your own machine. The API reaches the
   database over Railway's private network.
3. In the API service add the variable `DATABASE_URL` as a reference to the database (`${{Postgres.DATABASE_URL}}`).
   Only if you connect through the public proxy, append `?sslmode=require`.

## 2. Backend: Railway
- Source: GitHub repo `AttaUllah941/AI-HR-Backend`. Config is in `railway.json`; the build uses the `Dockerfile`.
- Build: `npx prisma generate && npm run build` (run inside the Dockerfile).
- Start: `npx prisma migrate deploy && node dist/server.js`. This applies the existing migrations only. Do not use
  `prisma db push` on production.
- Health check: `GET /api/v1/health/live` (liveness) and `/api/v1/health/ready` (includes database state).
- Railway injects `PORT`; leave it unset.

### Backend variables (Railway -> Variables)
| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | reference to the Railway Postgres service |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | two different values, from `openssl rand -hex 32` |
| `MFA_ENCRYPTION_KEY` | `openssl rand -hex 32`. Losing or rotating it invalidates enrolled MFA secrets. |
| `CORS_ORIGIN` | exact Vercel origin, e.g. `https://<project>.vercel.app` (no trailing slash; comma-separate several) |
| `APP_URL` | same Vercel URL |
| `TRUST_PROXY` | see "Client IP" below |
| `FILE_STORAGE_PROVIDER` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from the Cloudinary dashboard |
| `CLOUDINARY_FOLDER` | optional, default `zenith-hr` |
| `EMAIL_PROVIDER` | `smtp`, with `EMAIL_SMTP_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`. The API refuses `console` in production. |
| `AI_PROVIDER` | `mock`, or `openai` with `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` |
| `ALLOW_SELF_REGISTRATION` | `false` for a single-tenant site |

The API refuses to start in production with weak or identical JWT secrets, a missing `MFA_ENCRYPTION_KEY`, or
`FILE_STORAGE_PROVIDER=cloudinary` without the three Cloudinary values.

### First database setup
Migrations run automatically at start. Seed data (`prisma/seed.ts`: roles, permissions, base company) is a one-off
step. Inspect it first, then run it once against the Railway database (`railway run npm run prisma:seed`). Running it
twice may create duplicate demo data. Do not run `seed-qa.ts` in production.

### Client IP (`TRUST_PROXY`)
Rate limiting and branch IP allowlists use the client IP. `TRUST_PROXY` is the number of reverse proxies in front of
the API: `1` when browsers call Railway directly, `2` if requests pass through the Vercel rewrite and then Railway's
edge. **This is unverified for this setup.** After deploying, call an endpoint that logs the client IP (for example a
failed login) and confirm it shows the real client, not a Vercel or Railway address. Adjust `TRUST_PROXY` if it does not.

## 3. Files: Cloudinary
- Files are uploaded by the API as `raw` assets of type `authenticated`, so they are never publicly reachable. Preview
  and download go through the API, which checks permissions first, then streams the file via a signed URL.
- The existing upload validation (extension, MIME type, magic bytes, size limit `FILE_MAX_BYTES`) is unchanged.
- Existing rows keep the provider they were saved with (`StoredFile.storageProvider`), so local and Cloudinary files
  can coexist.
- The Cloudinary plan must allow raw files at least as large as `FILE_MAX_BYTES` (default 10 MB).
- `CLOUDINARY_API_SECRET` exists only in Railway. It is never sent to Angular.

## 4. Frontend: Vercel
- Source: GitHub repo `AttaUllah941/AI-HR-Frontend`. Settings come from `vercel.json`.
- Install `npm ci`, build `npm run build`, output directory `dist/zenith-hr/browser`.
- `vercel.json` rewrites `/api/*` to the Railway API, so the Angular code keeps its relative `/api/v1` and needs no
  environment variables. It also adds the SPA fallback (deep links and refresh work) and security headers.
- **Before the first deploy**, replace `REPLACE-WITH-RAILWAY-DOMAIN.up.railway.app` in `vercel.json` with the real
  Railway domain (Railway -> API service -> Settings -> Networking -> Generate Domain). Rewrite destinations cannot
  read environment variables.
- Then set `CORS_ORIGIN` and `APP_URL` on Railway to the Vercel URL. Strictly speaking CORS is not needed while the
  rewrite is the only path (the browser sees one origin), but keep it exact as defence in depth.
- **Unverified:** Vercel limits request body size on proxied requests. Test a file upload close to 10 MB. If it fails,
  set `apiBaseUrl` in `src/environments/environment.ts` to the absolute Railway URL (`https://<railway>/api/v1`) and
  `TRUST_PROXY=1`; CORS then does the work.

## 5. Security checklist
- `.env`, `.env.production`, `.env.local` are git-ignored. Only `.env.example` and `.env.production.example`
  (names only) are tracked.
- HTTPS is provided by Vercel and Railway. Helmet, rate limiting, Zod validation and the permission checks are
  unchanged.
- The database has no public endpoint unless you create one.
- Rotate any secret that is ever pasted into chat, logs or a ticket.

## 6. Verification after deploy
1. `GET https://<railway>/api/v1/health/ready` returns 200.
2. Open the Vercel URL, log in, log out, refresh on `/dashboard` and `/employees`.
3. Create, edit and delete a record in each module you use.
4. Upload a file, preview it, download it, delete it, and confirm it appears and disappears in Cloudinary under
   `zenith-hr/<companyId>/`.

## 7. Troubleshooting
| Symptom | Check |
|---|---|
| Frontend cannot reach the backend (404/502 on `/api/...`) | The `vercel.json` rewrite still has the placeholder domain, or the Railway service is down. Open the Railway URL directly. |
| CORS error in the browser | `CORS_ORIGIN` must equal the exact page origin (scheme + host, no slash). Redeploy the API after changing it. |
| API crashes at start | Read Railway deploy logs. Startup refusals name the missing variable (JWT, MFA key, email, Cloudinary). |
| Database connection error | `DATABASE_URL` must reference the Railway Postgres service. Public proxy URLs need `?sslmode=require`. |
| Prisma migration error | Run `railway run npx prisma migrate status`. Never `migrate reset` or `db push` on production. |
| Cloudinary upload error | The three `CLOUDINARY_*` values, plan limits for raw files, and file size vs `FILE_MAX_BYTES`. |
| Login works, then 401 after a page reload | Check that the browser keeps `localStorage`/`sessionStorage` and that the refresh call is not blocked. |
| Everyone is rate limited together | `TRUST_PROXY` is too low, so all requests share one proxy IP. |
