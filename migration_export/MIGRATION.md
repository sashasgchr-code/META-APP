# BankEzee CRM — Full Migration Package

This bundle lets you stand up the app anywhere (any host / another Emergent app).

## What's inside
- `code.tar.gz` — full source (backend + frontend + .emergent + docs + memory), **without** node_modules/.git (reinstall with yarn/pip).
- `db_dump/` — MongoDB dump (mongodump) of the whole database, including all leads, users, sessions.
- `backend.env.sample` / `frontend.env.sample` — the exact env keys used (replace secrets on the new host).
- `GOOGLE_SHEET_WEBHOOK.md` — instant-sync Apps Script setup (optional).

## Tech stack
- Backend: FastAPI (Python), MongoDB via Motor, GridFS for document attachments.
- Frontend: React (CRA) + TailwindCSS + shadcn/ui. Fully responsive (mobile = stacked cards on Leads, responsive layouts everywhere) — there is NO separate native mobile app; the "mobile setup" is Tailwind responsive classes in the React code.
- Auth: JWT (email/password) + Emergent Google auth.
- Emails: Resend (via Emergent integration proxy — on a non-Emergent host you must swap to your own Resend API key).

## 1. Restore the database
```bash
# Mongo must be running on the target
mongorestore --uri="mongodb://localhost:27017" --db=test_database ./db_dump/test_database
```
(Change the DB name to match DB_NAME in your new backend/.env.)

## 2. Backend setup
```bash
cd backend
pip install -r requirements.txt
# create backend/.env from backend.env.sample and fill values
uvicorn server:app --host 0.0.0.0 --port 8001
```
Required backend/.env keys (see backend.env.sample):
- MONGO_URL, DB_NAME
- JWT/auth: (admin seed) ADMIN_EMAIL, ADMIN_PASSWORD, OPS_EMAIL, OPS_PASSWORD
- GOOGLE_SHEET_ID  (published Google Sheet used for lead sync)
- WEBHOOK_CRON_SECRET (shared secret for /api/cron/sync-leads and /api/webhook/sheet-sync)
- SYNC_INTERVAL_MINUTES (auto-sync interval, e.g. 2)
- EMAIL / Resend keys (Emergent integration key on Emergent; your own Resend key elsewhere)

## 3. Frontend setup
```bash
cd frontend
yarn install
# set REACT_APP_BACKEND_URL in frontend/.env to your backend's public URL
yarn start        # dev
yarn build        # production build (serve the build/ folder)
```
IMPORTANT: All backend routes are prefixed with `/api`. The frontend must call
`${REACT_APP_BACKEND_URL}/api/...`. Keep that ingress rule on the new host.

## 4. Auto-sync + webhook
- In-process scheduler auto-syncs the sheet every SYNC_INTERVAL_MINUTES (no external cron needed).
- Optional instant push: `POST /api/webhook/sheet-sync?token=WEBHOOK_CRON_SECRET` + the Apps Script in GOOGLE_SHEET_WEBHOOK.md.

## Default admin (from the dump / seed)
- admin: sasha.sgchr@gmail.com / Admin@123456
- ops:   rama.saffronglobal@gmail.com / Ops@123456
- processors: teja@bankezee.com, saikiran@bankezee.com / Processor@123
- growth partner: sasha@neosales.org / Sas12sa!!
(Change these in production.)

## Notes
- GridFS collections (fs.files/fs.chunks) are empty in this dump because file documents were cleared in a recent "Reset to fresh"; the structure is preserved and will populate as documents are uploaded.
- Emergent-specific pieces: Google auth and the Resend email proxy use the Emergent integration key. On a non-Emergent host, replace with your own Google OAuth client and Resend API key.

---

# Integration Wiring & Migration Notes (Resend + Google OAuth)

> Documentation only — the running app is UNCHANGED. This section tells you exactly
> what to swap when you run OFF Emergent (self-hosted / another cloud).

## A) Email (currently via Emergent Resend proxy)

### Current Emergent-proxy dependency
The app does NOT talk to Resend directly today. It calls the Emergent integrations proxy,
which holds the real Resend key server-side.

Exact code (backend `/app/backend/server.py`):
- Config (top of file, ~lines 42-44):
  - `EMAIL_BASE_URL = "https://integrations.emergentagent.com"`
  - `EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")`
  - `EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "BankEzee CRM")`
  - `EMAIL_REPLY_TO` (optional) → sent as `contact_email`
- `send_email(to, subject, html)` (~line 269): `POST {EMAIL_BASE_URL}/api/v1/email/send`
  with header `X-Email-Key: EMAIL_KEY` and JSON body `{to:[...], subject, html, from_name, contact_email?}`.
- `_send_safe(to, subject, html)` (~line 368): wraps `send_email` with try/except (swallows 422 to
  generic/invalid recipients so the app never crashes on a bad address).
- Callers (the actual notifications, ~lines 282-436):
  `notify_partner_assigned`, `notify_processors_new_file`, `notify_file_update`,
  `notify_staff_new_leads`, `notify_staff_converted`, plus partner earnings/updates.
- All of them early-return if `EMAIL_KEY` is empty (so with no key, the app runs but sends nothing).

### Required environment variables (independent Resend)
Add to `backend/.env`:
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx      # from https://resend.com/api-keys
EMAIL_FROM="BankEzee CRM <no-reply@yourdomain.com>"   # MUST be on a verified domain
EMAIL_REPLY_TO=support@yourdomain.com        # optional
EMAIL_FROM_NAME="BankEzee CRM"
```
(You can drop `EMERGENT_EMAIL_KEY` / `EMAIL_BASE_URL` once you move off the proxy.)

### What must be replaced (code)
Rewrite ONLY `send_email()` to call Resend directly (leave `_send_safe` and all `notify_*` as-is):
```python
# pip install resend   (or use httpx as below)
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "BankEzee CRM <no-reply@yourdomain.com>")

async def send_email(*, to: str, subject: str, html: str):
    _assert_safe_email(subject, html)
    async with httpx.AsyncClient(timeout=30) as hc:
        resp = await hc.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": EMAIL_FROM, "to": [to], "subject": subject, "html": html,
                  **({"reply_to": EMAIL_REPLY_TO} if EMAIL_REPLY_TO else {})},
        )
    resp.raise_for_status()
    return resp.json().get("id")
```
Also update the `EMAIL_KEY` guards: swap the `if not EMAIL_KEY` checks in the `notify_*`
functions to `if not RESEND_API_KEY`.

### Domain / DNS requirements for Resend
In the Resend dashboard → Domains → Add Domain (`yourdomain.com`), then add the DNS records it shows:
- **SPF**: TXT record (e.g. `v=spf1 include:amazonses.com ~all` — Resend gives the exact value).
- **DKIM**: one or more CNAME (or TXT) records Resend provides.
- **DMARC** (recommended): TXT at `_dmarc.yourdomain.com` (e.g. `v=DMARC1; p=none;`).
- No MX record needed for sending.
Wait for the domain to show **Verified** in Resend before sending.

### Sender verification requirements
- The `from` address domain must be a **verified** domain in Resend.
- Until verified, Resend only allows sending to your own account email (test mode).
- Free/unverified → deliverability fails; verified domain → normal delivery.

---

## B) Google login (currently via Emergent Auth)

### Current Emergent-proxy dependency
The app uses Emergent's hosted Google auth, not Google directly.

Flow today:
1. Frontend `/app/frontend/src/pages/Login.jsx` → `googleLogin()` (~line 30):
   `window.location.href = "https://auth.emergentagent.com/?redirect=" + <origin>/dashboard`
2. Emergent runs the Google consent, then redirects back to `<origin>/dashboard#session_id=<id>`.
3. Frontend detects `#session_id=` (in `context/AuthContext.jsx` ~line 25, `App.js` ~line 33,
   `pages/AuthCallback.jsx` ~lines 15-20) and calls `POST /api/auth/session` with header
   `X-Session-ID: <id>`.
4. Backend `google_session()` (`/app/backend/server.py` ~line 557) calls
   `EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"`
   (~line 41) with `X-Session-ID` to fetch `{email, name, picture}`, then upserts the user and
   creates an app session.
5. App sessions: `create_session()` (~line 148) stores a token in Mongo `user_sessions`;
   `set_session_cookie()` (~line 158) sets an httponly, secure `session_token` cookie;
   `get_current_user()` (~line 162) validates it. Email/password login (`/api/auth/login`)
   uses the SAME session mechanism and is fully independent of Google — it keeps working with no changes.

### Required environment variables (independent Google OAuth)
Add to `backend/.env`:
```
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxx
GOOGLE_REDIRECT_URI=https://yourdomain.com/api/auth/google/callback
FRONTEND_URL=https://yourdomain.com
```
Add to `frontend/.env` (only if you use the client-side button variant):
```
REACT_APP_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

### Google OAuth client setup (Google Cloud Console)
1. console.cloud.google.com → create/select a project.
2. APIs & Services → OAuth consent screen → configure (External), add your domain + scopes
   `openid`, `email`, `profile`.
3. Credentials → Create Credentials → **OAuth client ID** → type **Web application**.
4. **Authorized JavaScript origins**: `https://yourdomain.com` (and `http://localhost:3000` for dev).
5. **Authorized redirect URIs**: `https://yourdomain.com/api/auth/google/callback`
   (and `http://localhost:8001/api/auth/google/callback` for dev). Must match `GOOGLE_REDIRECT_URI` exactly.
6. Copy Client ID + Secret into `backend/.env`.

### Redirect / callback URLs summary
| | Current (Emergent) | Independent (your Google) |
|---|---|---|
| Start URL | `https://auth.emergentagent.com/?redirect=<origin>/dashboard` | `https://accounts.google.com/o/oauth2/v2/auth?...` |
| Return to | `<origin>/dashboard#session_id=...` | your `GOOGLE_REDIRECT_URI` (e.g. `/api/auth/google/callback`) |
| Token/profile fetch | `GET demobackend.emergentagent.com/.../session-data` w/ `X-Session-ID` | exchange `code` at `https://oauth2.googleapis.com/token`, then `GET https://www.googleapis.com/oauth2/v3/userinfo` |

### What must be replaced (code)
Frontend:
- `pages/Login.jsx` `googleLogin()`: point to Google's auth URL (Authorization Code flow) or use
  `@react-oauth/google`. Remove the `auth.emergentagent.com` redirect.
- `pages/AuthCallback.jsx` / `context/AuthContext.jsx` / `App.js`: replace the `#session_id=` hash
  handling with your callback handling (the backend can set the cookie and redirect to `/dashboard`
  in the Authorization Code flow, so the hash logic can be removed entirely).

Backend (`server.py`):
- Replace `google_session()` (`/auth/session`) with a standard OAuth callback, e.g.
  `GET /api/auth/google/callback?code=...`:
  1. Exchange `code` → tokens at `https://oauth2.googleapis.com/token`
     (params: code, client_id, client_secret, redirect_uri, grant_type=authorization_code).
  2. `GET https://www.googleapis.com/oauth2/v3/userinfo` with the access token → `{email, name, picture}`.
  3. Reuse the EXISTING upsert + `create_session()` + `set_session_cookie()` logic (unchanged),
     then `RedirectResponse` to `${FRONTEND_URL}/dashboard`.
- Remove `EMERGENT_SESSION_URL` usage.

### Frontend/backend config changes required (cross-domain cookies)
If frontend and backend are on **different domains**, the session cookie must be cross-site:
- In `set_session_cookie()` set `samesite="none", secure=True` (HTTPS required).
- CORS: `allow_origins=[FRONTEND_URL]`, `allow_credentials=True` (already permissive in the app; tighten for prod).
- Frontend axios must send credentials: `axios` instance with `withCredentials: true`
  (check `/app/frontend/src/lib/api` / wherever the axios instance is created).
If frontend+backend share one domain behind a path prefix (`/api`), the current same-site cookie is fine.

---

## Files that currently use these integrations (quick index)
- Email: `backend/server.py` → config ~L42-44; `send_email` ~L269; `_send_safe` ~L368; `notify_*` ~L282-436.
- Google auth: `backend/server.py` → `EMERGENT_SESSION_URL` ~L41; `google_session`/`/auth/session` ~L557;
  `create_session` ~L148; `set_session_cookie` ~L158; `get_current_user` ~L162.
- Frontend auth: `pages/Login.jsx` (~L30), `pages/AuthCallback.jsx` (~L15), `context/AuthContext.jsx` (~L25),
  `App.js` (~L33).
- Google Sheet sync (not an OAuth dependency — uses a PUBLISHED CSV export, no auth):
  `SHEET_CSV_URL` ~L35, `sync_leads_from_sheet()` ~L439+.
