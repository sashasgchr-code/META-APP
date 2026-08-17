# BankEzee CRM — PRD

## Original Problem Statement
Create a copy of https://crm.bankezee.com/ with one difference: leads are automatically imported from a public Google Sheet (Meta lead-form data) with additional fields as needed, and there must be an option to assign each lead to a Growth Partner.

## Architecture
- Frontend: React 19 (CRA + craco), Tailwind, shadcn/ui, recharts, sonner, framer-motion. Fonts: Outfit (headings) + IBM Plex Sans (body). Brand blue #0F52BA / navy #0A192F sidebar.
- Backend: FastAPI + Motor (MongoDB async). All routes under /api.
- Auth: Dual — JWT-style DB session (email/password, bcrypt) AND Emergent Google OAuth. Unified `user_sessions` (session_token, 7-day). `get_current_user` reads cookie then Bearer.
- Lead import: real public Google Sheet CSV export; dedupe by sheet `id`; filters out Meta test/organic dummy rows.
- Scheduling: `.emergent/crons.yml` hourly `sync-leads-hourly` -> POST /api/cron/sync-leads (Bearer WEBHOOK_CRON_SECRET, backgrounds work).

## User Personas
- Admin (owner, sasha.sgchr@gmail.com): sees all leads, dashboard, assigns leads to partners, views partner directory.
- Growth Partner (self-registers): sees only leads assigned to them; can update status & add notes; cannot assign or view partner directory.

## Core Requirements (static)
- Auto-import leads from Google Sheet + manual "Sync Now".
- Assign leads to Growth Partners.
- CRM pipeline (NEW/CONTACTED/CALLED/CONVERTED/REJECTED), dashboard stats + charts, lead detail with notes & activity timeline, partner directory.

## Implemented (2026-06)
- Dual auth (email/password + Google OAuth), growth-partner self-registration, admin seed.
- Google Sheet CSV import (initial + manual + hourly cron), dummy-row filtering, 238 real leads.
- Leads list with search/status/partner filters, per-row assign dropdown (admin).
- Lead detail: info panel, status buttons, assign dropdown, notes, activity timeline.
- Dashboard: metric cards, Leads-by-City bar chart, pipeline pie chart, last-sync indicator.
- Partners directory (admin-only) with assigned/converted counts.
- Role isolation enforced on all lead/partner endpoints. Tested 13/13 backend, 10/11 UI.

## Backlog / Remaining
- P1: Pagination on /api/leads (currently 2000 cap).
- P2: Partner-facing lead-generation (QR code) like original Bankezee retail/growth flows.
- P2: Email notifications to partner on assignment (Resend).
- P2: Commission/earnings tracking for partners.

## Next Tasks
- Add pagination + server-side sorting to leads.
- Optional: assignment email notifications.
