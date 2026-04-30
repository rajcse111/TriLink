# TriLink Referral Network — API

Production-grade **Node.js / Express** REST API for a 3-branch hierarchical referral network with 13-stage progression, automated income distribution, and a full admin panel.

**Deployment stack:** Angular (Vercel) → Node API (Render) → PostgreSQL (Supabase)

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Local Setup](#local-setup)
4. [Environment Variables](#environment-variables)
5. [Database Setup](#database-setup)
6. [Running the App](#running-the-app)
7. [CORS Configuration](#cors-configuration)
8. [Render Deployment](#render-deployment)
9. [Supabase Database](#supabase-database)
10. [API Reference](#api-reference)
11. [Business Logic](#business-logic)
12. [Scheduler & Batch Processing](#scheduler--batch-processing)
13. [Security](#security)
14. [Troubleshooting](#troubleshooting)

---

## Architecture

```
┌──────────────────────────┐
│   Angular SPA (Vercel)   │
│  trilink.vercel.app      │
└────────────┬─────────────┘
             │ HTTPS  (Authorization: Bearer <jwt>)
┌────────────▼─────────────┐
│  Node.js / Express API   │
│  (Render)                │
│                          │
│  Auth · User · Wallet    │
│  Genealogy · Income      │
│  Admin · Notifications   │
└──────┬──────────┬────────┘
       │          │
┌──────▼──────┐  ┌▼────────────────┐
│  PostgreSQL │  │  Redis (opt.)   │
│  (Supabase) │  │  (Render Redis  │
│             │  │   or Upstash)   │
└─────────────┘  └─────────────────┘
```

### Key Design Decisions

| Concern | Solution |
|---------|----------|
| Hierarchical tree | **Closure Table** — O(1) ancestor/descendant queries without recursive CTEs |
| Stage validation | Daily batch cron at 20:00 IST in chunks of 2 000 |
| Financial accuracy | Immutable append-only `transactions` ledger with before/after balances |
| Fraud prevention | IP tracking, device fingerprinting, account lockout |
| Caching | Redis for tree views / dashboards (graceful no-op fallback if unavailable) |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18.x or higher |
| npm | 8.x or higher |
| PostgreSQL | 14.x or higher |
| Redis | 6.x or higher (optional) |

---

## Local Setup

```bash
git clone <repository-url>
cd tandav-referral-api
npm install
cp .env.example .env   # then edit with your local values
```

---

## Environment Variables

### Minimal local `.env`

```env
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:4200

DB_HOST=localhost
DB_PORT=5432
DB_NAME=trilink_referral
DB_USER=postgres
DB_PASSWORD=your_postgres_password

JWT_SECRET=<run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_REFRESH_SECRET=<different value from above>

# Leave SMS_PROVIDER unset → OTPs are printed to the console (dev mode)
```

### All variables

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` disables dev-mode CORS bypass |
| `PORT` | `3000` | HTTP listen port (Render injects this automatically) |
| `FRONTEND_URL` | `http://localhost:4200` | Comma-separated list of CORS-allowed origins |
| `DATABASE_URL` | — | Full Postgres connection string (alternative to individual DB_* vars) |
| `DB_HOST/PORT/NAME/USER/PASSWORD` | — | Individual Postgres connection params |
| `DB_SSL` | `false` | Set `true` for Supabase / any TLS-required host |
| `DB_POOL_MIN/MAX` | `2 / 20` | Connection pool size |
| `REDIS_HOST/PORT/PASSWORD` | — | Redis connection (optional) |
| `JWT_SECRET` | — | Access token signing key (64+ random chars) |
| `JWT_REFRESH_SECRET` | — | Refresh token signing key (different from above) |
| `JWT_EXPIRES_IN` | `7d` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token TTL |
| `SMS_PROVIDER` | unset | `twilio` / `twilio_whatsapp` / `fast2sms`; unset = log only |
| `TWILIO_ACCOUNT_SID` | — | Required if `SMS_PROVIDER=twilio*` |
| `TWILIO_AUTH_TOKEN` | — | Required if `SMS_PROVIDER=twilio*` |
| `TWILIO_FROM_NUMBER` | — | Required if `SMS_PROVIDER=twilio` |
| `TWILIO_WHATSAPP_FROM` | — | Required if `SMS_PROVIDER=twilio_whatsapp` |
| `FAST2SMS_API_KEY` | — | Required if `SMS_PROVIDER=fast2sms` |
| `SMTP_HOST/PORT/USER/PASS` | — | Email via Nodemailer |
| `ACTIVATION_FEE` | `100` | Fee in INR per activation |
| `LEVEL1_INCOME` – `LEVEL5_INCOME` | `40/20/10/5/2` | Level income in INR |
| `MAX_LEVELS_FOR_INCOME` | `10` | How many ancestor levels receive income per activation |
| `BATCH_PROCESSOR_CRON` | `0 20 * * *` | Daily batch schedule (20:00 IST) |
| `BATCH_SIZE` | `2000` | Users processed per batch chunk |
| `STAGE_COUNT` | `13` | Total stages |

---

## Database Setup

### Local PostgreSQL

```bash
# Create database
psql -U postgres -c "CREATE DATABASE trilink_referral;"

# Run migrations (creates all tables, indexes, functions, triggers)
npm run migrate

# Seed root user + super admin (idempotent)
npm run seed
```

**Seeded credentials:**

```
Root User
  Associate ID : TLK0000001
  Referral Code: TLKROOT001
  Mobile       : 9000000000
  Password     : Root@123456
  Txn Password : Txn@123456

Super Admin
  Email        : admin@trilink.com
  Password     : Admin@123456
```

> Change these credentials immediately in production.

### Supabase

See [Supabase Database](#supabase-database) section below.

---

## Running the App

```bash
npm run dev    # nodemon (hot reload)
npm start      # production

# Health check
curl http://localhost:3000/api/health
```

---

## CORS Configuration

CORS is configured in `src/app.js`. Allowed origins are read from `FRONTEND_URL` (comma-separated for multiple origins).

```
FRONTEND_URL=https://trilink.vercel.app
# Multiple origins:
FRONTEND_URL=https://trilink.vercel.app,https://staging.trilink.vercel.app
```

The server responds to `OPTIONS` preflight requests before any other middleware runs. In `NODE_ENV=development` all origins are allowed. In `production` only URLs listed in `FRONTEND_URL` are permitted.

**When deploying to Render**, set `FRONTEND_URL` to your Vercel app URL in the Render dashboard under **Environment → Environment Variables**.

---

## Render Deployment

### 1. Create a new Web Service on Render

- **Repository:** connect your GitHub repo
- **Root directory:** `tandav-referral-api`
- **Runtime:** Node
- **Build command:** `npm install`
- **Start command:** `npm start`

### 2. Set environment variables on Render

Add all required variables from the table above. Key production values:

```
NODE_ENV=production
DB_SSL=true
FRONTEND_URL=https://your-app.vercel.app
DATABASE_URL=<Supabase connection string — see below>
JWT_SECRET=<64-char random hex>
JWT_REFRESH_SECRET=<different 64-char random hex>
```

Generate secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Run migrations on first deploy

In the Render dashboard, open the service **Shell** tab and run:

```bash
npm run migrate
npm run seed
```

Or add a one-time job in Render's **Jobs** feature.

### 4. Verify

```bash
curl https://your-app.onrender.com/api/health
```

> **Note:** Free Render services spin down after 15 minutes of inactivity. The first request after a cold start may take ~30 seconds.

---

## Supabase Database

### 1. Create a project on supabase.com

Go to **Project Settings → Database → Connection string → URI** and copy the `postgresql://...` string.

### 2. Set on Render

```
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
DB_SSL=true
```

Use the **pooler** (port `6543`) URL for serverless-style connection pooling, not the direct connection (port `5432`).

### 3. Run migrations via Supabase SQL editor

Alternatively, paste the contents of `database/migrations/001_initial.sql` and `002_add_password_reset_action.sql` into the Supabase **SQL Editor** and run them, then run `npm run seed` from the Render shell.

---

## API Reference

**Base URL (production):** `https://your-app.onrender.com/api`

All protected endpoints require: `Authorization: Bearer <access_token>`

### Auth

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/auth/referral/:code` | Public |
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/otp/send` | Public |
| POST | `/auth/otp/verify` | Public |
| POST | `/auth/refresh` | Public |
| POST | `/auth/logout` | Auth |
| PUT | `/auth/change-password` | Auth |

### User

| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/user/dashboard` | |
| GET/PUT | `/user/profile` | |
| POST | `/user/profile/image` | multipart/form-data |
| POST/GET | `/user/kyc` | front_image + back_image |
| GET/POST/DELETE | `/user/bank-details` | |
| POST | `/user/activate` | Pays activation fee, triggers income distribution |
| PUT | `/user/transaction-password` | Requires OTP |

### Genealogy (Auth + Active)

| Endpoint | Description |
|----------|-------------|
| `GET /genealogy/sponsor` | Direct sponsor |
| `GET /genealogy/team/all` | All descendants |
| `GET /genealogy/team/left\|middle\|right` | Branch teams |
| `GET /genealogy/team/active\|inactive` | Filtered teams |
| `GET /genealogy/tree` | Hierarchical tree view |
| `GET /genealogy/levels` | Level-wise breakdown |

### Wallet (Auth + Active)

| Endpoint | Description |
|----------|-------------|
| `GET /wallet/balance` | Current balance |
| `GET /wallet/transactions` | Ledger history |
| `POST /wallet/withdraw` | Request withdrawal (debits immediately) |
| `GET /wallet/withdrawals` | Withdrawal history |

### Income (Auth + Active)

`GET /income/overview` · `/income/level` · `/income/daily` · `/income/history`

### Other

`GET /meetings` · `GET /meetings/:id` · `POST/GET /complaints` · `GET /notifications` · `GET /stage/progress` · `GET /api/health`

### Admin

All admin endpoints require `Authorization: Bearer <admin_token>` from `POST /admin/auth/login`.

| Endpoint | Role |
|----------|------|
| `GET /admin/users` | Admin |
| `POST /admin/users/:id/activate\|deactivate` | Admin |
| `POST /admin/users/:id/credit` | **Super Admin** |
| `GET/POST /admin/kyc/pending` · `/admin/kyc/:id/verify` | Admin |
| `GET/POST /admin/withdrawals/pending` · `/admin/withdrawals/:id/process` | Admin |
| `POST/PUT/DELETE /admin/meetings` | Admin |
| `GET /admin/reports` | Admin |
| `POST /admin/batch/trigger` | **Super Admin** |
| `GET /admin/batch/logs` | Admin |

---

## Business Logic

### Referral Tree

Each user has exactly **3 slots** (left / middle / right). The tree is stored as a **Closure Table** (`tree_closure`) — every ancestor–descendant pair is a row with its `depth`. If a requested position is taken and `autoPlace=true`, BFS finds the nearest empty slot.

### Stage Progression

| Stage | Required Active Members | Stage Bonus |
|-------|------------------------|-------------|
| 1 | 3 | ₹100 |
| 2 | 12 | ₹300 |
| 3 | 39 | ₹900 |
| 4 | 120 | ₹2,700 |
| 5 | 363 | ₹8,100 |
| 6 | 1,092 | ₹24,300 |
| 7 | 3,279 | ₹72,900 |
| 8 | 9,840 | ₹2,18,700 |
| 9 | 29,523 | ₹6,56,100 |
| 10 | 88,572 | ₹19,68,300 |
| 11 | 2,65,719 | ₹59,04,900 |
| 12 | 5,31,441 | ₹1,77,14,700 |
| 13 | 7,97,160 | ₹5,31,44,100 (Retirement) |

Formula: required = `(3^(n+1) − 3) / 2`

### Income Distribution (per activation)

| Ancestor Level | Income |
|----------------|--------|
| 1 (direct sponsor) | ₹40 |
| 2 | ₹20 |
| 3 | ₹10 |
| 4 | ₹5 |
| 5 – 10 | ₹2 each |

Only flows to **active, non-retired** ancestors.

---

## Scheduler & Batch Processing

Daily cron at **20:00 IST** (env: `BATCH_PROCESSOR_CRON`):

1. Stage validation for all active users (batches of `BATCH_SIZE`)
2. Expired OTP cleanup (>1 hour old)
3. Old notification archival (read + >90 days)

Logs stored in `batch_logs` table. Manual trigger (Super Admin): `POST /api/admin/batch/trigger`

---

## Security

| Feature | Implementation |
|---------|---------------|
| Auth | JWT access (7d) + refresh (30d) with `token_version` invalidation |
| Passwords | bcrypt (12 rounds) |
| Account lockout | 5 failed attempts → 15-min lock |
| Rate limiting | 100 req/15 min (global) · 10/15 min (auth) · 2/1 min (OTP) · 5/1 hr (withdrawal) |
| Fraud detection | IP tracking + device fingerprint |
| SQL injection | Parameterized queries throughout |
| CORS | Whitelist-only (`FRONTEND_URL`) |
| Security headers | Helmet.js |
| Financial integrity | All wallet mutations inside DB transactions |
| Audit trail | Immutable `transactions` + `login_logs` tables |

---

## Troubleshooting

**Cannot connect to PostgreSQL (Supabase)**
- Ensure `DB_SSL=true` and use the pooler URL (port `6543`)
- Check the password has no special characters that need URL-encoding in `DATABASE_URL`

**CORS errors in the browser**
- Verify `FRONTEND_URL` on Render matches the Vercel URL exactly (no trailing slash)
- Check `NODE_ENV=production` is set on Render — development mode allows all origins

**OTP not received**
- In development: OTPs are printed to the server log (no SMS sent when `SMS_PROVIDER` is unset)
- In production: verify `SMS_PROVIDER` and the corresponding credentials

**Stage not advancing after activation**
```bash
# Trigger batch manually via API (Super Admin token required)
curl -X POST https://your-app.onrender.com/api/admin/batch/trigger \
  -H "Authorization: Bearer <admin_token>"
```

**Cold start on Render free tier**
The first request after 15 minutes of inactivity triggers a ~30s spin-up. Upgrade to a paid instance type to avoid this.

**Clear Redis cache**
```bash
redis-cli KEYS "trilink:*" | xargs redis-cli DEL
```
