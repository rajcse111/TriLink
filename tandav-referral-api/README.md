# Tandav Referral Network API

A production-grade **Referral-Based Networking Application** built with **Node.js** and **PostgreSQL**. The system implements a strict 3-branch hierarchical referral tree with 13-stage progression, automated income distribution, and comprehensive admin management.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [Installation & Setup](#installation--setup)
5. [Environment Configuration](#environment-configuration)
6. [Database Setup](#database-setup)
7. [Running the Application](#running-the-application)
8. [API Reference](#api-reference)
9. [Business Logic](#business-logic)
10. [Scheduler & Batch Processing](#scheduler--batch-processing)
11. [Security](#security)
12. [Production Deployment](#production-deployment)
13. [Maintenance](#maintenance)
14. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Client Apps                        │
│         (Web / Mobile / Admin Panel)                 │
└─────────────────────────┬───────────────────────────┘
                          │ HTTPS REST API
┌─────────────────────────▼───────────────────────────┐
│              Node.js / Express API                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │  Auth    │ │  User    │ │  Genealogy / Tree    │ │
│  │  Routes  │ │  Routes  │ │  Routes              │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │ Wallet   │ │  Income  │ │  Admin Panel         │ │
│  │  Routes  │ │  Routes  │ │  Routes              │ │
│  └──────────┘ └──────────┘ └──────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Core Services                         │ │
│  │  ReferralService │ StageService │ PaymentService│ │
│  │  NotificationService │ SchedulerService         │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
┌──────────────▼──────┐  ┌───────────▼────────────────┐
│   PostgreSQL 14+    │  │        Redis               │
│   (Primary Store)   │  │   (Cache / Sessions)       │
│   - Closure Table   │  │   - Tree data cache        │
│   - Recursive CTEs  │  │   - Dashboard cache        │
└─────────────────────┘  └────────────────────────────┘
```

### Key Design Decisions

| Concern | Solution |
|---------|----------|
| Hierarchical tree | **Closure Table** pattern — O(1) ancestor/descendant queries |
| Stage validation | Batch processing nightly (20:00 IST) in chunks of 2000 |
| Financial accuracy | Immutable ledger (`transactions` table) with before/after balances |
| Fraud prevention | IP tracking, device fingerprinting, account lockout |
| Caching | Redis for tree views, dashboards (graceful fallback if Redis unavailable) |

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18.x or higher |
| npm | 8.x or higher |
| PostgreSQL | 14.x or higher |
| Redis | 6.x or higher (optional but recommended) |
| Git | Any recent version |

### Check versions
```bash
node --version    # v18.0.0+
npm --version     # 8.0.0+
psql --version    # 14.0+
redis-cli --version  # 6.0+ (optional)
```

---

## Project Structure

```
tandav-referral-api/
├── src/
│   ├── app.js                    # Express app setup (middleware, routes)
│   ├── config/
│   │   ├── database.js           # PostgreSQL connection pool
│   │   └── redis.js              # Redis client + cache helpers
│   ├── controllers/
│   │   ├── auth.controller.js    # Registration, login, OTP
│   │   ├── user.controller.js    # Profile, KYC, activation
│   │   ├── genealogy.controller.js # Tree, team lists
│   │   ├── wallet.controller.js  # Balance, withdrawals
│   │   ├── income.controller.js  # Level income, daily reports
│   │   ├── meeting.controller.js # Meeting/seminar schedule
│   │   ├── complaint.controller.js # Support tickets
│   │   └── admin.controller.js   # Full admin operations
│   ├── middleware/
│   │   ├── auth.middleware.js    # JWT authentication
│   │   ├── admin.middleware.js   # Admin JWT + role check
│   │   ├── rateLimit.middleware.js # Rate limiters
│   │   └── fraud.middleware.js   # Device tracking, IP checks
│   ├── routes/
│   │   ├── index.js              # Route aggregator
│   │   ├── auth.routes.js
│   │   ├── user.routes.js
│   │   ├── genealogy.routes.js
│   │   ├── wallet.routes.js
│   │   ├── income.routes.js
│   │   ├── meeting.routes.js
│   │   ├── complaint.routes.js
│   │   └── admin.routes.js
│   ├── services/
│   │   ├── referral.service.js   # Tree placement, BFS auto-placement
│   │   ├── stage.service.js      # Stage progression engine
│   │   ├── payment.service.js    # Income distribution, wallet ops
│   │   ├── otp.service.js        # OTP generation/verification
│   │   ├── notification.service.js # In-app notifications
│   │   └── scheduler.service.js  # Daily batch cron job
│   └── utils/
│       ├── logger.js             # Winston rotating logs
│       ├── response.js           # Standardized API responses
│       ├── crypto.js             # JWT, bcrypt, OTP helpers
│       └── validators.js         # Joi validation schemas
├── database/
│   ├── migrations/
│   │   ├── 001_initial.sql       # Complete schema + functions + views
│   │   └── run.js                # Migration runner
│   └── seeds/
│       └── seed.js               # Root user + admin seeder
├── uploads/                      # Profile images, KYC docs (gitignored)
├── logs/                         # Rotating log files (gitignored)
├── server.js                     # Entry point with graceful shutdown
├── .env.example                  # Environment template
├── .gitignore
├── package.json
└── README.md
```

---

## Installation & Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd tandav-referral-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create environment file

```bash
cp .env.example .env
```

Then edit `.env` with your actual configuration (see [Environment Configuration](#environment-configuration)).

---

## Environment Configuration

Copy the example file and edit it:

```bash
cp .env.example .env
```

Open `.env` and set these values for local testing:

```env
# App
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:4200

# Database — must match your local PostgreSQL setup
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tandav_referral
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Redis — optional, app runs fine without it
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT secrets — any random strings work for local testing
# Run the command below to generate them
JWT_SECRET=your_jwt_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Financial settings — keep defaults for testing
ACTIVATION_FEE=100
LEVEL1_INCOME=40
LEVEL2_INCOME=20
LEVEL3_INCOME=10

# Batch job schedule (20:00 IST daily) — keep defaults
BATCH_PROCESSOR_CRON="0 20 * * *"
BATCH_SIZE=2000
```

**Generate random JWT secrets (run once, paste into `.env`):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Database Setup

### 1. Create the database

```bash
# Connect to PostgreSQL
psql -U postgres

# In psql shell:
CREATE DATABASE tandav_referral;
\q
```

### 2. Run migrations

```bash
npm run migrate
```

This creates all tables, indexes, functions, triggers, and views.

### 3. Seed initial data

```bash
npm run seed
```

This creates:
- **Root user** (genesis node - every new user's referral chain leads here)
- **Super Admin** account

**Seeded credentials:**
```
Root User:
  Associate ID : TDV0000001
  Referral Code: TDVROOT001
  Mobile       : 9000000000
  Password     : Root@123456
  Txn Password : Txn@123456

Admin:
  URL     : POST /api/admin/auth/login
  Email   : admin@tandav.com
  Password: Admin@123456
```

> **Important:** Change these credentials immediately in production!

---

## Running the Application

### Development (with auto-reload)

```bash
npm run dev
```

### Production

```bash
npm start
```

### Verify it's running

```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-04-12T14:30:00.000Z",
  "services": { "database": "up" }
}
```

---

## API Reference

### Base URL: `http://localhost:3000/api`

### Authentication

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

---

### Auth Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/auth/referral/:code` | Validate referral code + available positions | Public |
| POST | `/auth/register` | Register new user | Public |
| POST | `/auth/login` | Login with password | Public |
| POST | `/auth/otp/send` | Send OTP to mobile | Public |
| POST | `/auth/otp/verify` | Verify OTP and login | Public |
| POST | `/auth/refresh` | Refresh access token | Public |
| POST | `/auth/logout` | Logout (invalidate token) | Auth |
| PUT | `/auth/change-password` | Change login password | Auth |

**Register payload:**
```json
{
  "full_name": "John Doe",
  "mobile": "9876543210",
  "email": "john@example.com",
  "password": "Password@123",
  "transaction_password": "123456",
  "referral_code": "TDVROOT001",
  "position": "left",
  "father_husband_name": "Richard Doe",
  "date_of_birth": "1990-01-15",
  "gender": "male",
  "marital_status": "married",
  "address": "123 Main Street",
  "state": "Maharashtra",
  "district": "Pune",
  "terms_accepted": true
}
```

**Position values:** `left`, `middle`, `right`

---

### User Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/user/dashboard` | Full dashboard data | Auth |
| GET | `/user/profile` | View profile | Auth |
| PUT | `/user/profile` | Update profile | Auth |
| POST | `/user/profile/image` | Upload profile photo | Auth |
| GET | `/user/welcome-letter` | Get welcome letter data | Auth |
| POST | `/user/kyc` | Submit KYC documents | Auth |
| GET | `/user/kyc` | Get KYC status | Auth |
| GET | `/user/bank-details` | List bank accounts | Auth |
| POST | `/user/bank-details` | Add bank account | Auth |
| DELETE | `/user/bank-details/:id` | Remove bank account | Auth |
| POST | `/user/activate` | Activate account (₹100) | Auth |
| PUT | `/user/transaction-password` | Change txn password | Auth |

---

### Genealogy Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/genealogy/sponsor` | Direct sponsor info (DS) |
| GET | `/genealogy/team/all` | All team members (AT) |
| GET | `/genealogy/team/left` | Left branch team (LT) |
| GET | `/genealogy/team/middle` | Middle branch team (MT) |
| GET | `/genealogy/team/right` | Right branch team (RT) |
| GET | `/genealogy/team/active` | Active members only |
| GET | `/genealogy/team/inactive` | Inactive members |
| GET | `/genealogy/tree` | Tree view (TV) |
| GET | `/genealogy/levels` | Level-wise breakdown (LG) |

**Tree View query params:**
```
GET /genealogy/tree?associate_id=TDV0000123&depth=4
```

---

### Wallet Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallet/balance` | Current wallet balance |
| GET | `/wallet/transactions` | Transaction history |
| POST | `/wallet/withdraw` | Request withdrawal |
| GET | `/wallet/withdrawals` | Withdrawal history |

**Withdrawal payload:**
```json
{
  "amount": 500,
  "bank_detail_id": "uuid-of-bank-account",
  "transaction_password": "123456"
}
```

---

### Income Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/income/overview` | Total income by type |
| GET | `/income/level` | Level income summary (LB) |
| GET | `/income/daily` | Daily income report (DP) |
| GET | `/income/history` | Paginated income records |

---

### Meeting Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/meetings` | List upcoming meetings |
| GET | `/meetings/:id` | Get meeting details |

---

### Complaint Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/complaints` | Submit complaint/suggestion (NM) |
| GET | `/complaints` | View your complaints (VM) |
| GET | `/complaints/:id` | View specific complaint |

**Types:** `complaint`, `suggestion`, `query`

---

### Notification Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | Get notifications |
| POST | `/notifications/read` | Mark as read |
| GET | `/notifications/count` | Unread count |

---

### Stage Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stage/progress` | Stage progress + requirements |

---

### Admin Endpoints

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/admin/auth/login` | Admin login | Public |
| GET | `/admin/users` | List all users | Admin |
| GET | `/admin/users/:id` | User details | Admin |
| POST | `/admin/users/:id/activate` | Activate user (offline) | Admin |
| POST | `/admin/users/:id/deactivate` | Deactivate user | Admin |
| POST | `/admin/users/:id/credit` | Manual wallet credit | Super Admin |
| GET | `/admin/kyc/pending` | Pending KYC list | Admin |
| POST | `/admin/kyc/:id/verify` | Approve/reject KYC | Admin |
| GET | `/admin/withdrawals/pending` | Pending withdrawals | Admin |
| POST | `/admin/withdrawals/:id/process` | Approve/reject withdrawal | Admin |
| POST | `/admin/meetings` | Create meeting | Admin |
| PUT | `/admin/meetings/:id` | Update meeting | Admin |
| DELETE | `/admin/meetings/:id` | Remove meeting | Admin |
| GET | `/admin/complaints` | All complaints | Admin |
| POST | `/admin/complaints/:id/respond` | Respond to complaint | Admin |
| GET | `/admin/reports` | Reports (overview/revenue/growth) | Admin |
| POST | `/admin/batch/trigger` | Trigger manual batch | Super Admin |
| GET | `/admin/batch/logs` | Batch processing logs | Admin |

**Admin Login:**
```json
{ "email": "admin@tandav.com", "password": "Admin@123456" }
```

**KYC verify payload:**
```json
{ "action": "approve" }
// or
{ "action": "reject", "reason": "Document not clear" }
```

**Withdrawal process payload:**
```json
{ "action": "approve", "note": "Processed via NEFT" }
```

---

## Business Logic

### Referral Tree Rules

1. Each user can have **exactly 3** direct referrals: `left`, `middle`, `right`
2. When a position is taken, **auto-placement** finds the next available slot via BFS
3. The tree forms a perfect ternary structure growing as 3^n

### Stage Progression

| Stage | Required Members | Stage Bonus |
|-------|-----------------|-------------|
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
| 13 | 7,97,160 | ₹5,31,44,100 |

After Stage 13 → User is marked **Retired**.

### Income Distribution (on each activation)

| Level | Income |
|-------|--------|
| Level 1 (direct sponsor) | ₹40 |
| Level 2 | ₹20 |
| Level 3 | ₹10 |
| Level 4 | ₹5 |
| Level 5+ | ₹2 |

Income only flows to **active, non-retired** ancestors.

### Activation Flow

```
User Registers → Chooses Sponsor + Position → Placed in Tree
    ↓
User Pays ₹100 (online/offline) → Account Activated
    ↓
Level Income distributed to all active upline ancestors
    ↓
Stage check triggered for all ancestors (may advance stages)
    ↓
Notifications sent to user + sponsor
```

---

## Scheduler & Batch Processing

A daily cron job runs at **20:00 IST** (configurable via `BATCH_PROCESSOR_CRON`):

1. **Stage Validation** — Checks all active users for stage completion in batches of 2000
2. **Expired OTP cleanup** — Removes OTPs older than 1 hour
3. **Old notification archival** — Removes read notifications older than 90 days

**Batch processing logs** are stored in the `batch_logs` table.

**Manual trigger** (Super Admin only):
```bash
POST /api/admin/batch/trigger
```

---

## Security

| Feature | Implementation |
|---------|---------------|
| Authentication | JWT (access 7d + refresh 30d) |
| Password hashing | bcrypt (rounds: 12) |
| Account lockout | 5 failed attempts → 15 min lock |
| Rate limiting | 100 req/15min (general), 10/15min (auth) |
| OTP security | 6-digit, 10-min expiry, 5 attempts max |
| Fraud detection | IP tracking + device fingerprint |
| SQL injection | Parameterized queries (no raw string concat) |
| CORS | Whitelist-only origins |
| Security headers | Helmet.js |
| Transaction safety | All financial ops in DB transactions |
| Audit trail | Immutable `transactions` + `login_logs` tables |

---

## Production Deployment

### 1. Environment setup

```bash
NODE_ENV=production
DB_SSL=true
```

### 2. Generate strong secrets

```bash
# JWT_SECRET (64+ chars)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# JWT_REFRESH_SECRET (different from above)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Nginx reverse proxy (recommended)

```nginx
server {
    listen 443 ssl;
    server_name api.tandav.com;

    ssl_certificate     /etc/ssl/certs/tandav.crt;
    ssl_certificate_key /etc/ssl/private/tandav.key;

    client_max_body_size 10M;

    location /api {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        alias /var/www/tandav/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4. PM2 process manager

```bash
npm install -g pm2

# Start
pm2 start server.js --name "tandav-api" --instances max

# Save config
pm2 save
pm2 startup

# Monitor
pm2 monit
pm2 logs tandav-api
```

### 5. PostgreSQL tuning (postgresql.conf)

```ini
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
maintenance_work_mem = 128MB
```

### 6. Create PostgreSQL admin user (don't use superuser)

```sql
CREATE USER tandav_app WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE tandav_referral TO tandav_app;
GRANT USAGE ON SCHEMA public TO tandav_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tandav_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO tandav_app;
```

---

## Maintenance

### Database backup

```bash
# Daily backup
pg_dump -U postgres -d tandav_referral -F c -f /backups/tandav_$(date +%Y%m%d).dump

# Restore
pg_restore -U postgres -d tandav_referral /backups/tandav_20260412.dump
```

### Log rotation

Logs auto-rotate daily (30-day retention via `winston-daily-rotate-file`).
Log files are in `./logs/`:
- `combined-YYYY-MM-DD.log` — All logs
- `error-YYYY-MM-DD.log` — Errors only
- `exceptions-YYYY-MM-DD.log` — Uncaught exceptions

### Monitoring key metrics

```sql
-- Active users per stage
SELECT current_stage, COUNT(*) FROM users WHERE is_active GROUP BY current_stage ORDER BY current_stage;

-- Today's activations
SELECT COUNT(*) FROM users WHERE DATE(activation_date) = CURRENT_DATE;

-- Pending withdrawals total
SELECT COUNT(*), SUM(amount) FROM withdrawal_requests WHERE status = 'pending';

-- Tree health check (orphan nodes)
SELECT COUNT(*) FROM users u WHERE u.sponsor_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM tree_closure WHERE ancestor_id = u.sponsor_id AND descendant_id = u.id);
```

### Clear Redis cache (if needed)

```bash
redis-cli -n 0 KEYS "tandav:*" | xargs redis-cli DEL
```

### Manually trigger stage batch

```bash
# Via API (Super Admin)
curl -X POST http://localhost:3000/api/admin/batch/trigger \
  -H "Authorization: Bearer <admin_token>"
```

---

## Troubleshooting

### Common Issues

**1. `Cannot connect to PostgreSQL`**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432
# Check credentials in .env
# Check DB_SSL setting
```

**2. `JWT_SECRET` not set error**
```bash
# Ensure .env is in project root and has JWT_SECRET set
cat .env | grep JWT_SECRET
```

**3. `Tree placement failed - No available slots`**
```
This means the sponsor's network is completely filled (rare for a new network).
Admin can manually assign: use auto-placement by providing only the referral code
without specifying position, and the system will BFS-find the next slot.
```

**4. Stage not advancing after activation**
```bash
# Manually trigger batch
curl -X POST /api/admin/batch/trigger -H "Authorization: Bearer <admin_token>"
# Or check batch logs
curl /api/admin/batch/logs -H "Authorization: Bearer <admin_token>"
```

**5. High memory / slow queries**
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;

-- Check index usage
SELECT indexname, idx_scan FROM pg_stat_user_indexes ORDER BY idx_scan;
```

**6. OTP not received**
```
In development: check server logs - OTP is printed to console.
In production: verify SMS_PROVIDER config and MSG91/Twilio credentials.
```

---

## Support

- For technical issues: create a complaint via `/api/complaints`
- For admin support: check `/api/admin/complaints`
- Batch logs: `/api/admin/batch/logs`
- Application logs: `./logs/` directory

---

## License

UNLICENSED — Proprietary software. All rights reserved.
