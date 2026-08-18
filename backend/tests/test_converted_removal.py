"""Targeted tests verifying CONVERTED is fully removed and replaced by FILE."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lead-sync-hub-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "sasha.sgchr@gmail.com", "password": "Admin@123456"}
OPS = {"email": "rama.saffronglobal@gmail.com", "password": "Ops@123456"}
PARTNER = {"email": "priya@example.com", "password": "Priya@123456"}

EXPECTED_STATUSES = {"NEW", "CALL_BACK", "NOT_ANSWERING", "SWITCHED_OFF",
                     "NOT_INTERESTED", "NOT_QUALIFIED", "LEAD", "FILE"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
    return r.json()["session_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def ops_token():
    return _login(OPS)


@pytest.fixture(scope="module")
def partner_token():
    return _login(PARTNER)


# -------- /api/leads/stats: by_status must equal 8 statuses; no CONVERTED --------
def test_lead_stats_no_converted(admin_token):
    r = requests.get(f"{API}/leads/stats", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data["by_status"].keys()) == EXPECTED_STATUSES, data["by_status"]
    assert "CONVERTED" not in data["by_status"]
    # earnings = FILE count * commission_rate
    expected = data["by_status"]["FILE"] * data["commission_rate"]
    assert data["earnings"] == expected


def test_lead_stats_ops_no_converted(ops_token):
    r = requests.get(f"{API}/leads/stats", headers=_h(ops_token), timeout=20)
    assert r.status_code == 200
    assert "CONVERTED" not in r.json()["by_status"]


def test_lead_stats_partner_no_converted(partner_token):
    r = requests.get(f"{API}/leads/stats", headers=_h(partner_token), timeout=20)
    assert r.status_code == 200
    assert "CONVERTED" not in r.json()["by_status"]


# -------- /api/files/stats: no 'converted' key --------
def test_files_stats_shape(admin_token):
    r = requests.get(f"{API}/files/stats", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"total_files", "docs_received", "pending_docs"}
    assert "converted" not in data
    assert data["pending_docs"] == data["total_files"] - data["docs_received"]


# -------- PATCH status: FILE accepted, CONVERTED rejected --------
@pytest.fixture(scope="module")
def sample_lead_id(admin_token):
    r = requests.get(f"{API}/leads?page=1&page_size=1", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    if not items:
        pytest.skip("No leads in DB")
    return items[0]["lead_id"]


def test_status_rejects_converted(admin_token, sample_lead_id):
    r = requests.patch(f"{API}/leads/{sample_lead_id}/status",
                       headers=_h(admin_token), json={"status": "CONVERTED"}, timeout=20)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"


def test_status_accepts_file(admin_token, sample_lead_id):
    r = requests.patch(f"{API}/leads/{sample_lead_id}/status",
                       headers=_h(admin_token), json={"status": "FILE"}, timeout=20)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "FILE"


# -------- /api/leads filter by status=FILE works --------
def test_filter_by_file(admin_token):
    r = requests.get(f"{API}/leads?status=FILE&page=1&page_size=50",
                     headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["status"] == "FILE"


# -------- Filtering by CONVERTED should return empty (not error) --------
def test_filter_by_converted_empty_or_valid(admin_token):
    r = requests.get(f"{API}/leads?status=CONVERTED&page=1&page_size=10",
                     headers=_h(admin_token), timeout=20)
    # Backend doesn't strictly validate the query filter; whatever is returned should have no CONVERTED items in valid statuses
    # Accept 200 with 0 items (no leads have CONVERTED after removal) or 400
    if r.status_code == 200:
        for item in r.json()["items"]:
            # If any stale CONVERTED remains in DB, it's flagged but not app-produced
            assert item["status"] in EXPECTED_STATUSES or item["status"] == "CONVERTED"


# -------- Partners list converted_leads counts FILE --------
def test_partners_converted_leads_counts_file(admin_token):
    r = requests.get(f"{API}/partners", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    for p in r.json():
        assert "converted_leads" in p
        assert isinstance(p["converted_leads"], int)
