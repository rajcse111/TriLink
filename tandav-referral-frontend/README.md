# TriLink Referral Network — Frontend

Angular 17+ SPA for the TriLink referral network. Includes a user portal and a separate admin portal, each with their own layout shell.

**Deployment stack:** Angular (Vercel) → Node API (Render) → PostgreSQL (Supabase)

---

## Local Development

```bash
npm install
ng serve          # dev server at http://localhost:4200
```

API calls are proxied to `http://localhost:3000` via `proxy.conf.json` — the backend must be running locally.

```bash
ng build                              # production build → dist/tandav-referral-frontend/browser/
ng build --configuration development  # dev build with source maps
ng test                               # Karma unit tests
```

---

## Environment Configuration

| File | Used when |
|------|-----------|
| `src/environments/environment.ts` | `ng serve` (dev) |
| `src/environments/environment.prod.ts` | `ng build` (production) |

**Before deploying to Vercel**, update `environment.prod.ts` with your Render service URL:

```typescript
export const environment = {
  production: true,
  apiUrl:  'https://YOUR_APP.onrender.com/api',   // ← replace
  apiBase: 'https://YOUR_APP.onrender.com',        // ← replace
};
```

- `apiUrl` — base path for all API calls (used by `ApiService`)
- `apiBase` — base URL for constructing image/file URLs returned by the API (KYC docs, profile photos)

---

## Vercel Deployment

### 1. Push to GitHub

Vercel deploys from a Git repository.

### 2. Import the project on vercel.com

- **Framework preset:** Angular (auto-detected)
- **Root directory:** `tandav-referral-frontend`
- Vercel reads `vercel.json` which sets the build command, output directory, and SPA rewrites automatically — no manual configuration needed

### 3. Set environment variables on Vercel (optional)

No runtime environment variables are needed by the Angular build — all config is baked in at build time via `environment.prod.ts`. If you want to avoid committing the Render URL, you can use Angular's `fileReplacements` or a build-time define — but for most projects simply editing `environment.prod.ts` before each deploy is sufficient.

### 4. Set FRONTEND_URL on Render

After Vercel assigns your URL (e.g. `https://trilink.vercel.app`), go to the Render dashboard for the API service and add/update:

```
FRONTEND_URL=https://trilink.vercel.app
```

This is what the API uses to whitelist CORS. Redeploy the Render service after updating it.

### 5. Verify

Open your Vercel URL, log in with the seeded credentials, and check the browser's Network tab — API calls should return `200` with no CORS errors.

---

## Project Notes

- **Two portals, two layout shells** — user portal (`/`) uses `layout.ts` (red sidebar); admin portal (`/admin`) uses `admin-layout.ts` (dark navy sidebar). Auth pages (`/login`, `/register`, `/admin/login`) are standalone.
- **All HTTP calls go through `ApiService`** — never use `HttpClient` directly in components.
- **Auth state** is held in `AuthService` signals (`currentUser`, `currentAdmin`) and persisted in `localStorage` under `trilink_*` keys.
- **Parallel data loading** — pages that need multiple API calls use `forkJoin`. See `income.ts` and `admin-reports.ts` for the pattern.
- **Inline confirmations** — no `confirm()` dialogs. Destructive actions use `deletingId` / `pendingRejectId` state with inline confirm/cancel buttons.
- **Logo** — `trilink-logo.svg` is served from `/public` and referenced as `/trilink-logo.svg` in templates.

---

## Default Credentials (after seeding the backend)

```
Member login  →  /login
  Mobile  : 9000000000
  Password: Root@123456

Admin login   →  /admin/login
  Email   : admin@trilink.com
  Password: Admin@123456
```
