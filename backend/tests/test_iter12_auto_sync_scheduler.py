"""
Iteration 12: Test in-process auto-sync scheduler for BankEzee CRM.
- Verifies scheduler auto-imports leads without any manual trigger
- Verifies cron endpoint auth
- Verifies manual sync endpoint still works
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"] if os.environ.get("REACT_APP_BACKEND_URL") else None
# fallback to frontend .env
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
CRON_SECRET = os.environ["WEBHOOK_CRON_SECRET"]


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


# --- Scheduler startup log check ---
def test_scheduler_startup_log():
    with open("/var/log/supervisor/backend.err.log") as f:
        content = f.read()
    assert "Started in-process auto-sync scheduler" in content
    assert "Auto-sync tick" in content


# --- Cron endpoint auth ---
def test_cron_endpoint_requires_auth():
    r = requests.post(f"{BASE_URL}/api/cron/sync-leads", timeout=30)
    assert r.status_code == 401


def test_cron_endpoint_with_bearer_secret():
    r = requests.post(f"{BASE_URL}/api/cron/sync-leads",
                      headers={"Authorization": f"Bearer {CRON_SECRET}"}, timeout=90)
    assert r.status_code in (200, 202), f"{r.status_code} {r.text}"
    data = r.json()
    assert data.get("accepted") is True, f"Response: {data}"


# --- Manual sync ---
def test_manual_sync_admin(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/leads/sync", timeout=120)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    for k in ("imported", "updated", "total_rows"):
        assert k in data, f"Missing key {k} in {data}"


# --- Core test: delete a lead and verify auto-sync re-imports it ---
def test_auto_sync_reimports_deleted_lead(db):
    leads = db["leads"]
    # pick a lead sourced from sheet (non-empty sheet_id)
    target = leads.find_one({"sheet_id": {"$exists": True, "$nin": [None, ""]}})
    assert target is not None, "No sheet-sourced leads found to delete"
    sheet_id = target["sheet_id"]
    full_name = target.get("full_name")
    print(f"Target sheet_id={sheet_id} full_name={full_name}")

    # HARD DELETE - only by sheet_id
    del_res = leads.delete_one({"sheet_id": sheet_id})
    assert del_res.deleted_count == 1

    # Confirm gone
    assert leads.find_one({"sheet_id": sheet_id}) is None

    # Wait up to ~2.5 min for background scheduler
    deadline = time.time() + 160
    reappeared = None
    while time.time() < deadline:
        reappeared = leads.find_one({"sheet_id": sheet_id})
        if reappeared:
            break
        time.sleep(10)

    assert reappeared is not None, f"Lead sheet_id={sheet_id} did not reappear via auto-sync in 160s"
    print(f"Lead reappeared: {reappeared.get('full_name')}")


# --- Verify tick log increases over interval ---
def test_periodic_ticks_in_log():
    with open("/var/log/supervisor/backend.err.log") as f:
        content = f.read()
    tick_count = content.count("Auto-sync tick")
    assert tick_count >= 1, f"Only {tick_count} 'Auto-sync tick' entries found"
    print(f"Total Auto-sync tick log entries: {tick_count}")
