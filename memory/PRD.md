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
- 2026-06: **Instant Sheet webhook** — `POST /api/webhook/sheet-sync?token=<secret>` (secret via ?token or Bearer, 5s debounce) triggers an immediate sheet sync. Paired with a Google Apps Script `onChange` trigger (see /app/GOOGLE_SHEET_WEBHOOK.md) so Meta-form rows push into the CRM within seconds; 2-min auto-sync remains the safety net. New-lead email alerts to admin/ops already fire on import (user chose email-only, no in-app).
- 2026-06: **Auto-sync scheduler fix** — in-process background loop (`SYNC_INTERVAL_MINUTES`, default 5, set to 2) imports leads regardless of external cron.
- 2026-06: **File card role permissions** — general file-info fields editable+saveable by admin/ops/assigned growth partner/assigned processor; Bank Eligibilities & File Processing Status editable only by admin/assigned processor; Notes addable by anyone with lead access.
- 2026-06: **Growth-partner FILE flow** — setting status to FILE via the status buttons now prompts "Documents received? yes/no" (FileStatusModal) and stores `docs_received`; assigned growth partners can view/upload/download/delete documents on their FILE leads.
- 2026-06: **Processor visibility fix** — `list_leads`, `files/stats`, `files/report`, and single-lead GET now branch on role==processor → `assigned_processor_id`, so processors see their files in Files/Leads/File Reports and can open the lead detail.
- 2026-06: **Partner→Processor mapping** — admin/ops set a default processor per growth partner (User Management "Default Processor" column, `PATCH /users/{id}/default-processor`). When that partner's lead becomes a FILE, the mapped processor is auto-assigned (if none set); admin/ops can still change it manually. Auto-assign runs on both status-button and call-modal FILE paths.
- 2026-06: **Dashboard "In Progress" fix** — now file-based (`lead_stats.files_in_progress` = FILE leads with no bank disbursed); increments when made FILE, drops to 0 when reversed out of FILE. Previously counted CALL_BACK+LEAD.
- 2026-06: **Admin Reset ("Reset to fresh")** — Danger Zone in User Management + `POST /admin/reset-data`.
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
