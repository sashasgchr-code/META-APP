"""Iteration 10 backend tests:
- FILE status via status button with docs_received
- Processor role visibility on /leads, /files/stats, /files/report, /leads/{id}
- Default processor mapping and auto-assign on FILE
- files_in_progress on /leads/stats increments/decrements on FILE toggle
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://lead-sync-hub-15.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("sasha.sgchr@gmail.com", "Admin@123456")
OPS = ("rama.saffronglobal@gmail.com", "Ops@123456")
PROCESSOR_TEJA = ("teja@bankezee.com", "Processor@123")
PROCESSOR_SAI = ("saikiran@bankezee.com", "Processor@123")
PARTNER = ("sasha@neosales.org", "Sas12sa!!")


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["session_token"]


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": login(*ADMIN),
        "ops": login(*OPS),
        "teja": login(*PROCESSOR_TEJA),
        "sai": login(*PROCESSOR_SAI),
        "partner": login(*PARTNER),
    }


@pytest.fixture(scope="module")
def partner_id(tokens):
    r = requests.get(f"{API}/users", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    users = r.json()
    partner = next(u for u in users if u["email"] == PARTNER[0])
    return partner["user_id"]


@pytest.fixture(scope="module")
def processor_ids(tokens):
    r = requests.get(f"{API}/processors", headers=hdr(tokens["admin"]), timeout=30)
    assert r.status_code == 200
    procs = {p["email"]: p["user_id"] for p in r.json()}
    return procs


@pytest.fixture(scope="module")
def sample_lead(tokens, partner_id):
    """Find or create a lead assigned to partner, and reset it to LEAD."""
    # Find an existing partner-assigned lead
    r = requests.get(f"{API}/leads?page_size=50", headers=hdr(tokens["partner"]), timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    if not items:
        pytest.skip("No leads assigned to sasha@neosales.org partner")
    # pick one and set it back to LEAD for a clean test
    lead = items[0]
    lid = lead["lead_id"]
    requests.patch(f"{API}/leads/{lid}/status", headers=hdr(tokens["admin"]),
                   json={"status": "LEAD"}, timeout=30)
    # Ensure a processor is unset so auto-assign path is testable
    requests.patch(f"{API}/leads/{lid}/processor", headers=hdr(tokens["admin"]),
                   json={"processor_id": None}, timeout=30)
    return lid


# ---------- Default processor mapping ----------
class TestDefaultProcessorMapping:
    def test_admin_can_set_default_processor(self, tokens, partner_id, processor_ids):
        teja = processor_ids[PROCESSOR_TEJA[0]]
        r = requests.patch(f"{API}/users/{partner_id}/default-processor",
                           headers=hdr(tokens["admin"]),
                           json={"processor_id": teja}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["default_processor_id"] == teja
        assert data["default_processor_name"]

    def test_ops_can_set_default_processor(self, tokens, partner_id, processor_ids):
        teja = processor_ids[PROCESSOR_TEJA[0]]
        r = requests.patch(f"{API}/users/{partner_id}/default-processor",
                           headers=hdr(tokens["ops"]),
                           json={"processor_id": teja}, timeout=30)
        assert r.status_code == 200
        assert r.json()["default_processor_id"] == teja

    def test_partner_cannot_set_default_processor(self, tokens, partner_id, processor_ids):
        teja = processor_ids[PROCESSOR_TEJA[0]]
        r = requests.patch(f"{API}/users/{partner_id}/default-processor",
                           headers=hdr(tokens["partner"]),
                           json={"processor_id": teja}, timeout=30)
        assert r.status_code == 403


# ---------- FILE status button with docs_received & auto-assign ----------
class TestFileStatusAndAutoAssign:
    def test_partner_sets_file_with_docs_received_true(self, tokens, sample_lead, partner_id, processor_ids):
        # Ensure mapping to Teja
        teja = processor_ids[PROCESSOR_TEJA[0]]
        requests.patch(f"{API}/users/{partner_id}/default-processor",
                       headers=hdr(tokens["admin"]),
                       json={"processor_id": teja}, timeout=30)
        # Partner sets FILE via status endpoint with docs_received
        r = requests.patch(f"{API}/leads/{sample_lead}/status",
                           headers=hdr(tokens["partner"]),
                           json={"status": "FILE", "docs_received": True}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "FILE"
        assert data.get("docs_received") is True
        # Auto-assign to Teja
        assert data.get("assigned_processor_id") == teja
        assert data.get("assigned_processor_name")

    def test_admin_manual_override_processor(self, tokens, sample_lead, processor_ids):
        sai = processor_ids[PROCESSOR_SAI[0]]
        r = requests.patch(f"{API}/leads/{sample_lead}/processor",
                           headers=hdr(tokens["admin"]),
                           json={"processor_id": sai}, timeout=30)
        assert r.status_code == 200
        assert r.json()["assigned_processor_id"] == sai

    def test_reverse_to_lead_keeps_no_processor_reassign(self, tokens, sample_lead, processor_ids):
        # revert to LEAD
        r = requests.patch(f"{API}/leads/{sample_lead}/status",
                           headers=hdr(tokens["admin"]),
                           json={"status": "LEAD"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["status"] == "LEAD"


# ---------- Processor visibility ----------
class TestProcessorVisibility:
    def _prep_file_for_teja(self, tokens, sample_lead, processor_ids):
        teja = processor_ids[PROCESSOR_TEJA[0]]
        # set FILE
        requests.patch(f"{API}/leads/{sample_lead}/status",
                       headers=hdr(tokens["admin"]),
                       json={"status": "FILE", "docs_received": True}, timeout=30)
        # ensure assigned to Teja
        requests.patch(f"{API}/leads/{sample_lead}/processor",
                       headers=hdr(tokens["admin"]),
                       json={"processor_id": teja}, timeout=30)
        return teja

    def test_processor_sees_file_in_leads(self, tokens, sample_lead, processor_ids):
        self._prep_file_for_teja(tokens, sample_lead, processor_ids)
        r = requests.get(f"{API}/leads?status=FILE&page_size=200",
                         headers=hdr(tokens["teja"]), timeout=30)
        assert r.status_code == 200
        ids = [x["lead_id"] for x in r.json()["items"]]
        assert sample_lead in ids

    def test_processor_can_get_lead_detail(self, tokens, sample_lead):
        r = requests.get(f"{API}/leads/{sample_lead}", headers=hdr(tokens["teja"]), timeout=30)
        assert r.status_code == 200
        assert r.json()["lead_id"] == sample_lead

    def test_other_processor_cannot_access(self, tokens, sample_lead):
        r = requests.get(f"{API}/leads/{sample_lead}", headers=hdr(tokens["sai"]), timeout=30)
        assert r.status_code == 403

    def test_processor_files_stats(self, tokens, sample_lead):
        r = requests.get(f"{API}/files/stats", headers=hdr(tokens["teja"]), timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["total_files"] >= 1
        assert j["docs_received"] >= 1

    def test_processor_files_report(self, tokens, sample_lead):
        r = requests.get(f"{API}/files/report", headers=hdr(tokens["teja"]), timeout=30)
        assert r.status_code == 200
        data = r.json()
        # aggregated report with overall.total_files >= 1
        assert data.get("overall", {}).get("total_files", 0) >= 1

    def test_processor_can_update_processing_status(self, tokens, sample_lead):
        # get valid processing status list
        v = requests.get(f"{API}/processing-statuses", headers=hdr(tokens["teja"]), timeout=30).json()
        target = v[0] if v else "In Progress"
        r = requests.patch(f"{API}/leads/{sample_lead}/processing-status",
                           headers=hdr(tokens["teja"]),
                           json={"status": target}, timeout=30)
        assert r.status_code == 200, r.text


# ---------- files_in_progress on /leads/stats ----------
class TestFilesInProgressCounter:
    def test_in_progress_increments_on_file_and_decrements_on_reverse(self, tokens, sample_lead):
        # Set FILE
        requests.patch(f"{API}/leads/{sample_lead}/status", headers=hdr(tokens["admin"]),
                       json={"status": "FILE", "docs_received": True}, timeout=30)
        r = requests.get(f"{API}/leads/stats", headers=hdr(tokens["admin"]), timeout=30)
        assert r.status_code == 200
        stats_after_file = r.json()
        assert "files_in_progress" in stats_after_file
        fip_file = stats_after_file["files_in_progress"]
        files_file = stats_after_file["by_status"]["FILE"]
        assert fip_file >= 1
        assert files_file >= 1

        # Reverse to LEAD
        requests.patch(f"{API}/leads/{sample_lead}/status", headers=hdr(tokens["admin"]),
                       json={"status": "LEAD"}, timeout=30)
        r2 = requests.get(f"{API}/leads/stats", headers=hdr(tokens["admin"]), timeout=30)
        assert r2.status_code == 200
        stats_after_rev = r2.json()
        assert stats_after_rev["files_in_progress"] == fip_file - 1
        assert stats_after_rev["by_status"]["FILE"] == files_file - 1
