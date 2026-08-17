"""Bankezee CRM Backend API tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://partner-leads-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "sasha.sgchr@gmail.com"
ADMIN_PASSWORD = "Admin@123456"

# Generate a unique partner for this test run
PARTNER_EMAIL = f"TEST_partner_{uuid.uuid4().hex[:8]}@example.com"
PARTNER_PASSWORD = "Partner@123456"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_token" in data
    assert data["user"]["role"] == "admin"
    return data["session_token"]


@pytest.fixture(scope="session")
def partner_token():
    # Register a fresh growth partner
    r = requests.post(f"{API}/auth/register", json={
        "name": "TEST Partner",
        "email": PARTNER_EMAIL,
        "password": PARTNER_PASSWORD,
        "phone": "9999999999",
    })
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "growth_partner"
    return data["session_token"], data["user"]["user_id"]


def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_admin(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=h(admin_token))
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_duplicate_register(self, partner_token):
        r = requests.post(f"{API}/auth/register", json={
            "name": "dup", "email": PARTNER_EMAIL, "password": "x", "phone": ""
        })
        assert r.status_code == 400


# ---------- Leads / Stats ----------
class TestLeads:
    def test_stats_admin(self, admin_token):
        r = requests.get(f"{API}/leads/stats", headers=h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "total" in d and "by_status" in d and "by_city" in d
        assert d["total"] > 0
        for s in ["NEW", "CONTACTED", "CALLED", "CONVERTED", "REJECTED"]:
            assert s in d["by_status"]

    def test_list_admin(self, admin_token):
        r = requests.get(f"{API}/leads", headers=h(admin_token))
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) > 0
        assert "lead_id" in arr[0]

    def test_list_partner_scoped(self, partner_token):
        token, _ = partner_token
        r = requests.get(f"{API}/leads", headers=h(token))
        assert r.status_code == 200
        # Fresh partner should have 0 leads
        assert r.json() == []

    def test_manual_sync(self, admin_token):
        r = requests.post(f"{API}/leads/sync", headers=h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "imported" in d and "updated" in d and "total_rows" in d


# ---------- Assign / Status / Notes ----------
class TestAssignFlow:
    def test_assign_admin_and_partner_scope(self, admin_token, partner_token):
        p_token, p_uid = partner_token
        # Pick an unassigned lead
        leads = requests.get(f"{API}/leads?partner=UNASSIGNED", headers=h(admin_token)).json()
        assert len(leads) > 0
        lead_id = leads[0]["lead_id"]

        # Assign as admin
        r = requests.patch(f"{API}/leads/{lead_id}/assign", headers=h(admin_token),
                           json={"partner_id": p_uid})
        assert r.status_code == 200
        assert r.json()["assigned_partner_id"] == p_uid

        # Verify GET as partner
        r = requests.get(f"{API}/leads/{lead_id}", headers=h(p_token))
        assert r.status_code == 200

        # Partner should now see 1 lead in list
        r = requests.get(f"{API}/leads", headers=h(p_token))
        assert r.status_code == 200
        assert any(x["lead_id"] == lead_id for x in r.json())

        # Partner cannot assign (403)
        r = requests.patch(f"{API}/leads/{lead_id}/assign", headers=h(p_token),
                           json={"partner_id": None})
        assert r.status_code == 403

        # Partner can change status
        r = requests.patch(f"{API}/leads/{lead_id}/status", headers=h(p_token),
                           json={"status": "CONTACTED"})
        assert r.status_code == 200
        assert r.json()["status"] == "CONTACTED"

        # Partner can add note
        r = requests.post(f"{API}/leads/{lead_id}/notes", headers=h(p_token),
                          json={"text": "TEST note from partner"})
        assert r.status_code == 200
        lead = r.json()
        assert any(n["text"] == "TEST note from partner" for n in lead["notes"])
        # Activity timeline updated
        assert any(a["type"] == "note" for a in lead["activities"])
        assert any(a["type"] == "status_change" for a in lead["activities"])

        # Invalid status
        r = requests.patch(f"{API}/leads/{lead_id}/status", headers=h(admin_token),
                           json={"status": "BOGUS"})
        assert r.status_code == 400

    def test_partner_cannot_access_other_lead(self, admin_token, partner_token):
        p_token, _ = partner_token
        # Get any lead not assigned to partner
        leads = requests.get(f"{API}/leads?partner=UNASSIGNED", headers=h(admin_token)).json()
        assert len(leads) > 0
        r = requests.get(f"{API}/leads/{leads[0]['lead_id']}", headers=h(p_token))
        assert r.status_code == 403


# ---------- Partners ----------
class TestPartners:
    def test_list_partners(self, admin_token, partner_token):
        r = requests.get(f"{API}/partners", headers=h(admin_token))
        assert r.status_code == 200
        arr = r.json()
        assert any(p["email"] == PARTNER_EMAIL.lower() for p in arr)
        p = next(p for p in arr if p["email"] == PARTNER_EMAIL.lower())
        assert "assigned_leads" in p and "converted_leads" in p


# ---------- Cron ----------
class TestCron:
    def test_cron_requires_secret(self):
        r = requests.post(f"{API}/cron/sync-leads")
        assert r.status_code == 401

    def test_cron_wrong_secret(self):
        r = requests.post(f"{API}/cron/sync-leads",
                          headers={"Authorization": "Bearer wrong"})
        assert r.status_code == 401
