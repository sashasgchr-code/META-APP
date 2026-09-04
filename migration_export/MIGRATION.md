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
