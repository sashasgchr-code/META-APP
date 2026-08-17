"""Backend tests for iteration 3: telephony/disposition + loan-file workflow.

Covers:
- POST /api/leads/{id}/calls: valid dispositions, NOT_QUALIFIED requires reason, invalid disposition -> 400
- Call log persistence: status set, call_logs entry, activity entry
- FILE disposition creates empty file dict and stores docs_received
- PATCH /api/leads/{id}/file: persists custom bank eligibility rows
- GET /api/files/stats: shape and role-scoping
- Role access: unassigned growth_partner -> 403 on /calls and /file; admin/ops OK; assigned partner OK
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "sasha.sgchr@gmail.com"
ADMIN_PASSWORD = "Admin@123456"
OPS_EMAIL = "rama.saffronglobal@gmail.com"
OPS_PASSWORD = "Ops@123456"
PARTNER_EMAIL = "priya@example.com"
PARTNER_PASSWORD = "Priya@123456"


def h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def ops_token():
    r = requests.post(f"{API}/auth/login", json={"email": OPS_EMAIL, "password": OPS_PASSWORD})
    assert r.status_code == 200
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def partner_login():
    r = requests.post(f"{API}/auth/login", json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"partner login failed: {r.status_code} {r.text}")
    d = r.json()
    return d["session_token"], d["user"]["user_id"]


@pytest.fixture(scope="module")
def partner_assigned_lead(admin_token, partner_login):
    """Assign one unassigned lead to priya and return lead_id."""
    _, pid = partner_login
    r = requests.get(f"{API}/leads?partner=UNASSIGNED&page=1&page_size=1", headers=h(admin_token))
    items = r.json()["items"]
    if not items:
        # try any lead
        items = requests.get(f"{API}/leads?page=1&page_size=1", headers=h(admin_token)).json()["items"]
    lid = items[0]["lead_id"]
    r = requests.patch(f"{API}/leads/{lid}/assign", headers=h(admin_token), json={"partner_id": pid})
    assert r.status_code == 200
    return lid


@pytest.fixture(scope="module")
def unassigned_other_lead(admin_token, partner_login):
    """A lead NOT assigned to priya (assigned to nobody or another partner) for 403 tests."""
    _, pid = partner_login
    r = requests.get(f"{API}/leads?page=1&page_size=25", headers=h(admin_token))
    for it in r.json()["items"]:
        if it.get("assigned_partner_id") != pid:
            return it["lead_id"]
    pytest.skip("no unassigned-to-partner lead available")


class TestCallLogValidation:
    def test_invalid_disposition(self, admin_token, partner_assigned_lead):
        r = requests.post(f"{API}/leads/{partner_assigned_lead}/calls", headers=h(admin_token),
                          json={"duration_seconds": 30, "disposition": "BOGUS"})
        assert r.status_code == 400

    def test_not_qualified_without_reason(self, admin_token, partner_assigned_lead):
        r = requests.post(f"{API}/leads/{partner_assigned_lead}/calls", headers=h(admin_token),
                          json={"duration_seconds": 30, "disposition": "NOT_QUALIFIED", "reason": ""})
        assert r.status_code == 400
        assert "reason" in r.json().get("detail", "").lower()

    def test_not_qualified_with_reason(self, admin_token, partner_assigned_lead):
        r = requests.post(f"{API}/leads/{partner_assigned_lead}/calls", headers=h(admin_token),
                          json={"duration_seconds": 45, "disposition": "NOT_QUALIFIED",
                                "reason": "TEST low CIBIL"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "NOT_QUALIFIED"
        assert d["disposition"] == "NOT_QUALIFIED"
        # call_logs has our entry
        latest = d["call_logs"][-1]
        assert latest["disposition"] == "NOT_QUALIFIED"
        assert latest["duration_seconds"] == 45
        assert "TEST low CIBIL" in latest["reason"]


class TestCallDispositions:
    @pytest.mark.parametrize("dispo", ["NOT_ANSWERING", "SWITCHED_OFF", "NOT_INTERESTED", "CALL_BACK", "LEAD"])
    def test_valid_dispositions_set_status(self, admin_token, partner_assigned_lead, dispo):
        r = requests.post(f"{API}/leads/{partner_assigned_lead}/calls", headers=h(admin_token),
                          json={"duration_seconds": 12, "disposition": dispo})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == dispo
        assert d["call_logs"][-1]["disposition"] == dispo
        # activity entry appended
        act = d.get("activities", [])
        assert any(a.get("type") == "call" for a in act)


class TestFileDispositionAndCard:
    def test_file_disposition_creates_file_and_docs(self, admin_token, partner_assigned_lead):
        r = requests.post(f"{API}/leads/{partner_assigned_lead}/calls", headers=h(admin_token),
                          json={"duration_seconds": 125, "disposition": "FILE", "docs_received": True})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "FILE"
        assert d["docs_received"] is True
        assert isinstance(d.get("file"), dict)

    def test_patch_file_persists_bank_rows(self, admin_token, partner_assigned_lead):
        payload = {"data": {
            "customer_name": "TEST Customer",
            "monthly_income": 75000,
            "loan_amount": 500000,
            "banks": [
                {"bank": "HDFC", "eligible": True, "note": "TEST ok"},
                {"bank": "ICICI", "eligible": False, "note": "TEST low income"},
            ],
        }}
        r = requests.patch(f"{API}/leads/{partner_assigned_lead}/file", headers=h(admin_token), json=payload)
        assert r.status_code == 200
        f = r.json()["file"]
        assert f["customer_name"] == "TEST Customer"
        assert len(f["banks"]) == 2 and f["banks"][0]["bank"] == "HDFC"

        # GET verifies persistence
        g = requests.get(f"{API}/leads/{partner_assigned_lead}", headers=h(admin_token)).json()
        assert g["file"]["monthly_income"] == 75000
        assert g["file"]["banks"][1]["bank"] == "ICICI"


class TestFilesStats:
    def test_stats_shape_admin(self, admin_token):
        r = requests.get(f"{API}/files/stats", headers=h(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("total_files", "docs_received", "pending_docs", "converted"):
            assert k in d
            assert isinstance(d[k], int)
        assert d["pending_docs"] == d["total_files"] - d["docs_received"]
        assert d["total_files"] >= 1  # at least the FILE lead created above

    def test_stats_ops_same_as_admin(self, admin_token, ops_token):
        a = requests.get(f"{API}/files/stats", headers=h(admin_token)).json()
        o = requests.get(f"{API}/files/stats", headers=h(ops_token)).json()
        assert a == o

    def test_stats_partner_scoped(self, partner_login, admin_token):
        token, _ = partner_login
        r = requests.get(f"{API}/files/stats", headers=h(token))
        assert r.status_code == 200
        d = r.json()
        adm = requests.get(f"{API}/files/stats", headers=h(admin_token)).json()
        # partner scope <= admin scope
        assert d["total_files"] <= adm["total_files"]


class TestRoleAccessCalls:
    def test_partner_can_log_call_on_own_lead(self, partner_login, partner_assigned_lead):
        token, _ = partner_login
        r = requests.post(f"{API}/leads/{partner_assigned_lead}/calls", headers=h(token),
                          json={"duration_seconds": 10, "disposition": "CALL_BACK"})
        assert r.status_code == 200
        assert r.json()["status"] == "CALL_BACK"

    def test_partner_cannot_access_other_lead(self, partner_login, unassigned_other_lead):
        token, _ = partner_login
        r = requests.post(f"{API}/leads/{unassigned_other_lead}/calls", headers=h(token),
                          json={"duration_seconds": 5, "disposition": "NOT_ANSWERING"})
        assert r.status_code == 403

    def test_partner_cannot_patch_other_file(self, partner_login, unassigned_other_lead):
        token, _ = partner_login
        r = requests.patch(f"{API}/leads/{unassigned_other_lead}/file", headers=h(token),
                           json={"data": {"x": 1}})
        assert r.status_code == 403

    def test_partner_can_patch_own_file(self, partner_login, partner_assigned_lead):
        token, _ = partner_login
        r = requests.patch(f"{API}/leads/{partner_assigned_lead}/file", headers=h(token),
                           json={"data": {"customer_name": "TEST Partner Edit"}})
        assert r.status_code == 200
        assert r.json()["file"]["customer_name"] == "TEST Partner Edit"


class TestStatusFilterLeads:
    def test_filter_by_new_statuses(self, admin_token):
        for st in ["NEW", "CALL_BACK", "NOT_ANSWERING", "SWITCHED_OFF",
                   "NOT_INTERESTED", "NOT_QUALIFIED", "LEAD", "FILE", "CONVERTED"]:
            r = requests.get(f"{API}/leads?status={st}&page=1&page_size=5", headers=h(admin_token))
            assert r.status_code == 200, f"status={st} -> {r.status_code}"
            for it in r.json()["items"]:
                assert it["status"] == st
