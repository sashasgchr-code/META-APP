"""Iteration 8 tests: Processor role, soft-delete users, /api/processors, PATCH /api/leads/{id}/processor, GET /api/files/report."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("sasha.sgchr@gmail.com", "Admin@123456")
OPS = ("rama.saffronglobal@gmail.com", "Ops@123456")
TEJA = ("teja@bankezee.com", "Processor@123")
SAI = ("saikiran@bankezee.com", "Processor@123")
PRIYA = ("priya@example.com", "Priya@123456")
FILE_LEAD_ID = "lead_55772c498293"


def h(t):
    return {"Authorization": f"Bearer {t}"}


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} failed {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def admin_token():
    return login(*ADMIN)["session_token"]


@pytest.fixture(scope="session")
def ops_token():
    return login(*OPS)["session_token"]


@pytest.fixture(scope="session")
def teja_token():
    return login(*TEJA)["session_token"]


@pytest.fixture(scope="session")
def priya_token():
    return login(*PRIYA)["session_token"]


# ---------------- Processor login / roles ----------------
class TestProcessorLogin:
    def test_teja_login(self):
        d = login(*TEJA)
        assert d["user"]["role"] == "processor"
        assert d["user"].get("approved") is True

    def test_saikiran_login(self):
        d = login(*SAI)
        assert d["user"]["role"] == "processor"


# ---------------- Register with role=processor -> pending ----------------
class TestRegisterProcessor:
    def test_register_processor_pending(self, admin_token):
        email = f"TEST_proc_{uuid.uuid4().hex[:8]}@bankezee.com"
        r = requests.post(f"{API}/auth/register", json={
            "name": "TEST Proc", "email": email, "password": "Proc@12345", "phone": "9998887777", "role": "processor"
        })
        assert r.status_code == 200
        d = r.json()
        assert d.get("status") == "pending"
        assert "session_token" not in d

        # cannot login until approved
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Proc@12345"})
        assert r2.status_code == 403

        # Admin can approve processor via same endpoint
        users = requests.get(f"{API}/users", headers=h(admin_token)).json()
        target = next(u for u in users if u["email"] == email.lower())
        assert target["role"] == "processor"
        uid = target["user_id"]
        r3 = requests.patch(f"{API}/users/{uid}/approve", headers=h(admin_token), json={"approved": True})
        assert r3.status_code == 200
        assert r3.json()["approved"] is True

        r4 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Proc@12345"})
        assert r4.status_code == 200
        assert r4.json()["user"]["role"] == "processor"

        # Cleanup: soft delete
        requests.delete(f"{API}/users/{uid}", headers=h(admin_token))


# ---------------- GET /api/processors ----------------
class TestProcessorsList:
    def test_admin_processors(self, admin_token):
        r = requests.get(f"{API}/processors", headers=h(admin_token))
        assert r.status_code == 200
        data = r.json()
        names = {p["name"] for p in data}
        assert "Teja" in names and "Saikiran" in names
        # No mongo _id leaking
        assert all("_id" not in p for p in data)

    def test_ops_processors(self, ops_token):
        r = requests.get(f"{API}/processors", headers=h(ops_token))
        assert r.status_code == 200

    def test_processor_can_see_processors(self, teja_token):
        r = requests.get(f"{API}/processors", headers=h(teja_token))
        assert r.status_code == 200

    def test_partner_forbidden(self, priya_token):
        r = requests.get(f"{API}/processors", headers=h(priya_token))
        assert r.status_code == 403


# ---------------- PATCH /api/leads/{id}/processor ----------------
class TestAssignProcessor:
    def test_admin_assigns_processor(self, admin_token):
        procs = requests.get(f"{API}/processors", headers=h(admin_token)).json()
        teja_id = next(p["user_id"] for p in procs if p["name"] == "Teja")
        r = requests.patch(f"{API}/leads/{FILE_LEAD_ID}/processor", headers=h(admin_token),
                           json={"processor_id": teja_id})
        assert r.status_code == 200, r.text
        # Verify persistence
        g = requests.get(f"{API}/leads/{FILE_LEAD_ID}", headers=h(admin_token)).json()
        assert g.get("assigned_processor_id") == teja_id
        assert g.get("assigned_processor_name") == "Teja"

    def test_partner_forbidden_to_assign(self, priya_token, admin_token):
        procs = requests.get(f"{API}/processors", headers=h(admin_token)).json()
        sai_id = next(p["user_id"] for p in procs if p["name"] == "Saikiran")
        r = requests.patch(f"{API}/leads/{FILE_LEAD_ID}/processor", headers=h(priya_token),
                           json={"processor_id": sai_id})
        assert r.status_code == 403

    def test_processor_can_assign(self, teja_token, admin_token):
        procs = requests.get(f"{API}/processors", headers=h(admin_token)).json()
        sai_id = next(p["user_id"] for p in procs if p["name"] == "Saikiran")
        r = requests.patch(f"{API}/leads/{FILE_LEAD_ID}/processor", headers=h(teja_token),
                           json={"processor_id": sai_id})
        assert r.status_code == 200
        # restore to Teja
        teja_id = next(p["user_id"] for p in procs if p["name"] == "Teja")
        requests.patch(f"{API}/leads/{FILE_LEAD_ID}/processor", headers=h(admin_token),
                       json={"processor_id": teja_id})


# ---------------- GET /api/files/report ----------------
class TestFilesReport:
    def test_admin_report_structure(self, admin_token):
        r = requests.get(f"{API}/files/report", headers=h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "overall" in d and "this_month" in d
        for section in (d["overall"], d["this_month"]):
            for k in ("total_files", "in_progress", "login", "approved", "disbursed", "rejected",
                     "approved_amount", "disbursed_amount", "pipeline_amount"):
                assert k in section, f"missing {k}"
        assert d["overall"]["total_files"] >= 1

    def test_ops_report(self, ops_token):
        r = requests.get(f"{API}/files/report", headers=h(ops_token))
        assert r.status_code == 200

    def test_report_partner_scoping(self, priya_token, admin_token):
        pr = requests.get(f"{API}/files/report", headers=h(priya_token)).json()
        adm = requests.get(f"{API}/files/report", headers=h(admin_token)).json()
        # partner sees <= admin
        assert pr["overall"]["total_files"] <= adm["overall"]["total_files"]

    def test_report_processor_scoping(self, teja_token, admin_token):
        pr = requests.get(f"{API}/files/report", headers=h(teja_token)).json()
        adm = requests.get(f"{API}/files/report", headers=h(admin_token)).json()
        assert pr["overall"]["total_files"] >= 1  # Teja is assigned lead_55772c498293
        assert pr["overall"]["total_files"] <= adm["overall"]["total_files"]

    def test_report_filters(self, admin_token):
        procs = requests.get(f"{API}/processors", headers=h(admin_token)).json()
        teja_id = next(p["user_id"] for p in procs if p["name"] == "Teja")
        r = requests.get(f"{API}/files/report?processor={teja_id}", headers=h(admin_token))
        assert r.status_code == 200
        assert r.json()["overall"]["total_files"] >= 1

        # date filter to future -> zero
        r2 = requests.get(f"{API}/files/report?from_date=2099-01-01", headers=h(admin_token))
        assert r2.status_code == 200
        assert r2.json()["overall"]["total_files"] == 0


# ---------------- Soft delete user ----------------
class TestSoftDeleteUser:
    def test_admin_cannot_delete_admin(self, admin_token):
        users = requests.get(f"{API}/users", headers=h(admin_token)).json()
        admin_user = next(u for u in users if u["email"] == ADMIN[0])
        r = requests.delete(f"{API}/users/{admin_user['user_id']}", headers=h(admin_token))
        assert r.status_code == 400

    def test_soft_delete_partner(self, admin_token):
        # Create fresh partner
        email = f"TEST_del_{uuid.uuid4().hex[:8]}@bankezee.com"
        pwd = "DelPw@1234"
        requests.post(f"{API}/auth/register", json={
            "name": "TEST DelPartner", "email": email, "password": pwd, "phone": "9998887777"
        })
        users = requests.get(f"{API}/users", headers=h(admin_token)).json()
        uid = next(u["user_id"] for u in users if u["email"] == email.lower())
        # Approve first so login works
        requests.patch(f"{API}/users/{uid}/approve", headers=h(admin_token), json={"approved": True})
        # Verify can login
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}).status_code == 200
        # Delete
        r = requests.delete(f"{API}/users/{uid}", headers=h(admin_token))
        assert r.status_code == 200
        # Removed from list
        users2 = requests.get(f"{API}/users", headers=h(admin_token)).json()
        assert uid not in {u["user_id"] for u in users2}
        # Login blocked
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd})
        assert r2.status_code == 403
        assert "disabl" in r2.json().get("detail", "").lower() or "delete" in r2.json().get("detail", "").lower()

    def test_partner_cannot_delete(self, priya_token, admin_token):
        users = requests.get(f"{API}/users", headers=h(admin_token)).json()
        ops_user = next(u for u in users if u["email"] == OPS[0])
        r = requests.delete(f"{API}/users/{ops_user['user_id']}", headers=h(priya_token))
        assert r.status_code == 403


# ---------------- Regressions ----------------
class TestRegressions:
    def test_call_logs(self, admin_token):
        r = requests.get(f"{API}/call-logs", headers=h(admin_token))
        assert r.status_code == 200

    def test_files_stats(self, admin_token):
        r = requests.get(f"{API}/files/stats", headers=h(admin_token))
        assert r.status_code == 200

    def test_leads_list(self, admin_token):
        r = requests.get(f"{API}/leads?page=1&page_size=5", headers=h(admin_token))
        assert r.status_code == 200
        assert "items" in r.json()

    def test_file_lead_detail_has_processor_fields(self, admin_token):
        r = requests.get(f"{API}/leads/{FILE_LEAD_ID}", headers=h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "FILE"
        assert "assigned_processor_name" in d or d.get("assigned_processor_id") is not None
