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

### Seeded demo user

After `npm run prisma:seed`:

- Email: `admin@zenith.local`
- Password: `Password123!`

## Docker

```bash
docker compose up -d postgres   # DB only
docker compose up --build       # API + DB (requires Docker)
```
