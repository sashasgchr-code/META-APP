"""Iteration 5 backend tests:
- GET /api/call-logs returns flattened rows sorted desc; partner scope
- PATCH /api/leads/{id}/file admin/ops OK, partner -> 403 (require_staff)
- Cascading eligibility payload persists
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("sasha.sgchr@gmail.com", "Admin@123456")
OPS = ("rama.saffronglobal@gmail.com", "Ops@123456")
PARTNER = ("priya@example.com", "Priya@123456")
PARTNER_LEAD_ID = "lead_55772c498293"


def h(t):
    return {"Authorization": f"Bearer {t}"}


def login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def admin_token():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def ops_token():
    return login(*OPS)


@pytest.fixture(scope="module")
def partner_token():
    return login(*PARTNER)


# ---------- /api/call-logs ----------
class TestCallLogs:
    def test_admin_lists_all(self, admin_token):
        r = requests.get(f"{API}/call-logs", headers=h(admin_token))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        row = rows[0]
        for k in ("lead_id", "customer", "mobile", "city", "lead_status",
                  "caller", "at", "duration_seconds", "disposition"):
            assert k in row, f"missing key {k}"
        # sorted desc by 'at'
        ats = [r_["at"] or "" for r_ in rows]
        assert ats == sorted(ats, reverse=True)

    def test_ops_lists_all_same_as_admin(self, admin_token, ops_token):
        a = requests.get(f"{API}/call-logs", headers=h(admin_token)).json()
        o = requests.get(f"{API}/call-logs", headers=h(ops_token)).json()
        assert len(a) == len(o)

    def test_partner_scoped(self, admin_token, partner_token):
        a = requests.get(f"{API}/call-logs", headers=h(admin_token)).json()
        p = requests.get(f"{API}/call-logs", headers=h(partner_token)).json()
        assert isinstance(p, list)
        assert len(p) <= len(a)
        # All partner rows must be on leads assigned to partner
        # Retrieve partner's leads to validate scope
        my = requests.get(f"{API}/leads?mine=1&page=1&page_size=200",
                          headers=h(partner_token)).json()
        allowed = {it["lead_id"] for it in my.get("items", [])}
        for row in p:
            assert row["lead_id"] in allowed

    def test_unauthenticated(self):
        r = requests.get(f"{API}/call-logs")
        assert r.status_code in (401, 403)


# ---------- PATCH /api/leads/{id}/file role restriction ----------
class TestFileRole:
    CASCADE = {"data": {
        "customer_name": "TEST Cascade",
        "loan_amount": 500000,
        "banks": [{
            "bank": "PIRAMAL",
            "eligible": "yes",
            "eligible_amount": 499712,
            "roi": 10.5,
            "login_done": "yes",
            "login_bank": "PIRAMAL",
            "application_id": "APP-TEST-1",
            "sm_name": "SM Test",
            "sm_number": "9999999999",
            "approval_status": "approved",
            "approved_bank": "PIRAMAL",
            "approved_amount": 499712,
            "tenure_months": 60,
            "approved_roi": 10.5,
            "disbursed": "yes",
            "disbursal_date": "2026-01-15",
            "disbursed_bank": "PIRAMAL",
            "disbursed_amount": 499712,
            "commission_pct": 1.0,
        }],
    }}

    def test_admin_patch_cascade(self, admin_token):
        r = requests.patch(f"{API}/leads/{PARTNER_LEAD_ID}/file",
                           headers=h(admin_token), json=self.CASCADE)
        assert r.status_code == 200, r.text
        f = r.json()["file"]
        assert f["customer_name"] == "TEST Cascade"
        assert f["banks"][0]["bank"] == "PIRAMAL"
        assert f["banks"][0]["disbursed"] == "yes"

    def test_ops_patch_allowed(self, ops_token):
        r = requests.patch(f"{API}/leads/{PARTNER_LEAD_ID}/file",
                           headers=h(ops_token),
                           json={"data": {"customer_name": "TEST Ops Edit"}})
        assert r.status_code == 200
        assert r.json()["file"]["customer_name"] == "TEST Ops Edit"

    def test_partner_forbidden(self, partner_token):
        r = requests.patch(f"{API}/leads/{PARTNER_LEAD_ID}/file",
                           headers=h(partner_token),
                           json={"data": {"customer_name": "TEST Partner blocked"}})
        assert r.status_code == 403

    def test_persistence_via_get(self, admin_token):
        # restore full cascade and verify GET
        requests.patch(f"{API}/leads/{PARTNER_LEAD_ID}/file",
                       headers=h(admin_token), json=self.CASCADE)
        g = requests.get(f"{API}/leads/{PARTNER_LEAD_ID}", headers=h(admin_token)).json()
        bank = g["file"]["banks"][0]
        assert bank["approval_status"] == "approved"
        assert bank["commission_pct"] == 1.0
        assert bank["disbursed_amount"] == 499712
