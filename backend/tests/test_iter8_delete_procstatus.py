"""Tests for lead soft-delete (single + bulk), role restrictions,
and processing-status update endpoint (iteration 8).
"""
import os
import time
import uuid
import requests
import pytest
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lead-sync-hub-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

_mongo = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
_db = _mongo[os.environ.get("DB_NAME", "test_database")]

ADMIN = {"email": "sasha.sgchr@gmail.com", "password": "Admin@123456"}
OPS = {"email": "rama.saffronglobal@gmail.com", "password": "Ops@123456"}
PARTNER = {"email": "priya@example.com", "password": "Priya@123456"}
PROCESSOR = {"email": "teja@bankezee.com", "password": "Processor@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()["session_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login(ADMIN),
        "ops": _login(OPS),
        "partner": _login(PARTNER),
        "processor": _login(PROCESSOR),
    }


def _make_lead(admin_tok, name_suffix):
    """Insert lead directly (no public create endpoint; leads come from Google Sheet sync)."""
    lead_id = f"TEST_LEAD_{name_suffix}_{uuid.uuid4().hex[:8]}"
    doc = {
        "lead_id": lead_id,
        "full_name": f"TEST_DEL_{name_suffix}",
        "phone": f"9{int(time.time()*1000) % 1000000000:09d}",
        "email": f"test_{lead_id}@bankezee.test",
        "city": "Hyderabad",
        "loan_type": "Personal Loan",
        "amount": 100000,
        "status": "NEW",
        "created_time": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "assigned_partner_id": None,
        "assigned_partner_name": None,
        "activities": [],
        "call_logs": [],
    }
    _db.leads.insert_one(doc)
    return lead_id


# ---------- Single delete ----------
class TestSingleDelete:
    def test_partner_delete_forbidden(self, tokens):
        lead_id = _make_lead(tokens["admin"], "p1")
        r = requests.delete(f"{API}/leads/{lead_id}", headers=_h(tokens["partner"]))
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_ops_delete_forbidden(self, tokens):
        lead_id = _make_lead(tokens["admin"], "o1")
        r = requests.delete(f"{API}/leads/{lead_id}", headers=_h(tokens["ops"]))
        assert r.status_code == 403

    def test_processor_delete_forbidden(self, tokens):
        lead_id = _make_lead(tokens["admin"], "pr1")
        r = requests.delete(f"{API}/leads/{lead_id}", headers=_h(tokens["processor"]))
        assert r.status_code == 403

    def test_admin_delete_success_and_excluded(self, tokens):
        atok = tokens["admin"]
        lead_id = _make_lead(atok, "a1")

        stats_before = requests.get(f"{API}/leads/stats", headers=_h(atok)).json()
        total_before = stats_before.get("total") or stats_before.get("total_leads") or 0

        r = requests.delete(f"{API}/leads/{lead_id}", headers=_h(atok))
        assert r.status_code == 200, r.text

        # excluded from list
        lst = requests.get(f"{API}/leads?page_size=5&q=TEST_DEL_a1", headers=_h(atok)).json()
        items = lst.get("items") or lst.get("leads") or []
        assert not any(it.get("lead_id") == lead_id for it in items)

        # stats decreased by 1
        stats_after = requests.get(f"{API}/leads/stats", headers=_h(atok)).json()
        total_after = stats_after.get("total") or stats_after.get("total_leads") or 0
        assert total_after == total_before - 1, f"stats total {total_before}->{total_after}"

    def test_admin_delete_nonexistent_404(self, tokens):
        r = requests.delete(f"{API}/leads/does-not-exist-xyz", headers=_h(tokens["admin"]))
        assert r.status_code == 404


# ---------- Bulk delete ----------
class TestBulkDelete:
    def test_partner_bulk_delete_forbidden(self, tokens):
        r = requests.post(f"{API}/leads/bulk-delete", json={"lead_ids": ["x"]}, headers=_h(tokens["partner"]))
        assert r.status_code == 403

    def test_admin_bulk_delete_empty_400(self, tokens):
        r = requests.post(f"{API}/leads/bulk-delete", json={"lead_ids": []}, headers=_h(tokens["admin"]))
        assert r.status_code == 400

    def test_admin_bulk_delete_success(self, tokens):
        atok = tokens["admin"]
        ids = [_make_lead(atok, f"b{i}") for i in range(3)]
        stats_before = requests.get(f"{API}/leads/stats", headers=_h(atok)).json()
        total_before = stats_before.get("total") or stats_before.get("total_leads") or 0

        r = requests.post(f"{API}/leads/bulk-delete", json={"lead_ids": ids}, headers=_h(atok))
        assert r.status_code == 200, r.text
        assert r.json().get("deleted") == 3

        stats_after = requests.get(f"{API}/leads/stats", headers=_h(atok)).json()
        total_after = stats_after.get("total") or stats_after.get("total_leads") or 0
        assert total_after == total_before - 3

        # none appear in list
        for lid in ids:
            lst = requests.get(f"{API}/leads?q={lid}", headers=_h(atok)).json()
            items = lst.get("items") or lst.get("leads") or []
            assert not any(it.get("lead_id") == lid for it in items)


# ---------- Processing status ----------
class TestProcessingStatus:
    def test_get_statuses(self, tokens):
        r = requests.get(f"{API}/processing-statuses", headers=_h(tokens["admin"]))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0

    @pytest.fixture
    def file_lead_id(self, tokens):
        # find any FILE lead
        r = requests.get(f"{API}/files?limit=1", headers=_h(tokens["admin"]))
        if r.status_code == 200:
            items = r.json().get("items") or r.json().get("files") or []
            if items:
                return items[0]["lead_id"]
        # fallback: any lead
        r = requests.get(f"{API}/leads?limit=1", headers=_h(tokens["admin"]))
        items = r.json().get("items") or r.json().get("leads") or []
        assert items, "no leads to test processing status"
        return items[0]["lead_id"]

    def test_admin_update_procstatus(self, tokens, file_lead_id):
        statuses = requests.get(f"{API}/processing-statuses", headers=_h(tokens["admin"])).json()
        target = statuses[0]
        r = requests.patch(f"{API}/leads/{file_lead_id}/processing-status",
                           json={"status": target}, headers=_h(tokens["admin"]))
        assert r.status_code == 200, r.text
        assert r.json().get("processing_status") == target

    def test_ops_update_procstatus(self, tokens, file_lead_id):
        statuses = requests.get(f"{API}/processing-statuses", headers=_h(tokens["admin"])).json()
        target = statuses[-1]
        r = requests.patch(f"{API}/leads/{file_lead_id}/processing-status",
                           json={"status": target}, headers=_h(tokens["ops"]))
        assert r.status_code == 200

    def test_processor_update_procstatus(self, tokens, file_lead_id):
        statuses = requests.get(f"{API}/processing-statuses", headers=_h(tokens["admin"])).json()
        target = statuses[0]
        r = requests.patch(f"{API}/leads/{file_lead_id}/processing-status",
                           json={"status": target}, headers=_h(tokens["processor"]))
        assert r.status_code == 200

    def test_partner_update_procstatus_forbidden(self, tokens, file_lead_id):
        r = requests.patch(f"{API}/leads/{file_lead_id}/processing-status",
                           json={"status": "Login Done"}, headers=_h(tokens["partner"]))
        assert r.status_code == 403

    def test_invalid_procstatus_400(self, tokens, file_lead_id):
        r = requests.patch(f"{API}/leads/{file_lead_id}/processing-status",
                           json={"status": "NOT_A_REAL_STATUS_ZZZ"}, headers=_h(tokens["admin"]))
        assert r.status_code == 400
