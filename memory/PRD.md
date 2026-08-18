# BankEzee CRM — PRD

## Problem statement
A copy of BankEzee CRM where leads auto-import from a Google Sheet (with extra fields as needed) and can be assigned to Growth Partners. Includes core CRM features, JWT/Google auth, processor roles, document management, and call logging.

## Stack
- Backend: FastAPI + MongoDB (Motor, GridFS), monolithic `/app/backend/server.py`
- Frontend: React + TailwindCSS, pages in `/app/frontend/src/pages/`
- Integrations: Resend (emails via Emergent proxy), Google Sheets sync (cron)

## Roles
- admin: full access
- ops (STAFF): sees all leads; can assign/bulk-assign growth partners, filter by partner (NOT bulk delete — admin only)
- growth_partner: sees only assigned leads (self-register, needs admin approval)
- processor: works files assigned to them

## Environments
- PREVIEW (dev): lead-sync-hub-15.preview.emergentagent.com
- PRODUCTION: https://meta.bankezee.com (redeploy needed to push preview changes)

## Implemented (latest first)
- 2026-06: **Mobile card view** for Leads (stacked cards <md, desktop table ≥md).
- 2026-06: **Assignment History** — assign/bulk-assign store `assigned_by`/`assigned_at`; shown as "by <name> · <date>" on each lead row/card.
- 2026-06: **Date Range Filter** on Leads — presets (All/Today/Last 7/Last 30) + custom from/to; backend `GET /api/leads?from_date&to_date` filters on `created_time`.
- 2026-06: **Date column** on Leads table (created_time formatted, sortable).
- 2026-06: **Ops can assign growth partners** — `assign_lead`, `bulk_assign`, `list_partners` now `require_staff`; frontend assign UI (dropdown, partner filter, checkboxes, bulk-assign bar) unlocked for ops via `isStaff`. Bulk delete remains admin-only.
- Leads table shows Employment, Salary, Outstanding, Name, Contact (phone+email), City, Status, Partner.
- Google Sheets ingestion + cron sync; JWT + Google auth; Resend emails.
- Click-to-dial + call disposition logging; FILE stage with bank eligibilities & processor status.
- GridFS document uploads + ZIP downloads; soft-delete for users/leads; File Reports + CSV exports.
- "CONVERTED" status fully removed; FILE is the final pipeline stage.

## Terminology
- `status`: pipeline flow (NEW → FILE). `processing_status`: bank progress after FILE.
- Soft delete: active queries use `{"deleted": {"$ne": True}}`.

## Backlog
- P1: Mobile responsiveness for the now-wider Leads table (card view vs horizontal scroll — pending user choice).
- P2: Real-time Google Sheets webhook (Apps Script trigger) instead of cron polling.
