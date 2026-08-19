"""Iteration 11: FILE lead permissions across roles.

Verifies:
- Growth Partner (assigned) can save file info but banks are preserved (ignored)
- Growth Partner cannot update processing-status (403)
- Growth Partner can add notes
- Ops can save file info, banks preserved, cannot update status (403), can add note
- Processor (assigned) can save file including banks, and update status, add note
- Admin can do everything
"""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
LEAD_ID = "lead_8d6e6756c1c8"

CREDS = {
    "admin": ("sasha.sgchr@gmail.com", "Admin@123456"),
    "ops": ("rama.saffronglobal@gmail.com", "Ops@123456"),
    "processor": ("teja@bankezee.com", "Processor@123"),
    "partner": ("sasha@neosales.org", "Sas12sa!!"),
}


def _login(role):
    email, pwd = CREDS[role]
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("session_token") or j.get("token")


@pytest.fixture(scope="module")
def tokens():
    return {r: _login(r) for r in CREDS}


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def _get_lead(token):
    r = requests.get(f"{BASE}/leads/{LEAD_ID}", headers=_hdr(token), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def test_lead_is_file_stage(tokens):
    lead = _get_lead(tokens["admin"])
    assert lead.get("status") == "FILE"


def test_partner_save_info_banks_preserved(tokens):
    baseline = _get_lead(tokens["admin"])
    existing_banks = (baseline.get("file") or {}).get("banks", [])
    data = dict(baseline.get("file") or {})
    data["mother_name"] = "PartnerTest Mom"
    # Attempt to inject a bank - should be ignored
    data["banks"] = [{"bank": "HACK BANK", "amount": 999}]
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/file", headers=_hdr(tokens["partner"]),
                       json={"data": data}, timeout=20)
    assert r.status_code == 200, r.text
    updated = r.json()
    assert (updated.get("file") or {}).get("mother_name") == "PartnerTest Mom"
    assert (updated.get("file") or {}).get("banks", []) == existing_banks, "GP must not modify banks"


def test_partner_status_forbidden(tokens):
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/processing-status", headers=_hdr(tokens["partner"]),
                       json={"status": "SENT_TO_BANK"}, timeout=20)
    assert r.status_code == 403


def test_partner_add_note(tokens):
    r = requests.post(f"{BASE}/leads/{LEAD_ID}/notes", headers=_hdr(tokens["partner"]),
                      json={"text": "GP note from iter11"}, timeout=20)
    assert r.status_code == 200


def test_ops_save_info_banks_preserved(tokens):
    baseline = _get_lead(tokens["admin"])
    existing_banks = (baseline.get("file") or {}).get("banks", [])
    data = dict(baseline.get("file") or {})
    data["mother_name"] = "OpsTest Mom"
    data["banks"] = [{"bank": "OPS HACK", "amount": 111}]
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/file", headers=_hdr(tokens["ops"]),
                       json={"data": data}, timeout=20)
    assert r.status_code == 200, r.text
    updated = r.json()
    assert (updated.get("file") or {}).get("mother_name") == "OpsTest Mom"
    assert (updated.get("file") or {}).get("banks", []) == existing_banks


def test_ops_status_forbidden(tokens):
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/processing-status", headers=_hdr(tokens["ops"]),
                      json={"status": "SENT_TO_BANK"}, timeout=20)
    assert r.status_code == 403


def test_ops_add_note(tokens):
    r = requests.post(f"{BASE}/leads/{LEAD_ID}/notes", headers=_hdr(tokens["ops"]),
                     json={"text": "Ops note iter11"}, timeout=20)
    assert r.status_code == 200


def test_processor_save_banks(tokens):
    baseline = _get_lead(tokens["admin"])
    data = dict(baseline.get("file") or {})
    data["mother_name"] = "ProcTest Mom"
    data["banks"] = [{"bank": "AXIS", "amount": 500000}]
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/file", headers=_hdr(tokens["processor"]),
                       json={"data": data}, timeout=20)
    assert r.status_code == 200, r.text
    updated = r.json()
    banks = (updated.get("file") or {}).get("banks", [])
    assert any(b.get("bank") == "AXIS" for b in banks)


def test_processor_status_ok(tokens):
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/processing-status", headers=_hdr(tokens["processor"]),
                      json={"status": "Sent for Login"}, timeout=20)
    assert r.status_code == 200


def test_admin_status_ok(tokens):
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/processing-status", headers=_hdr(tokens["admin"]),
                      json={"status": "Underwriting"}, timeout=20)
    assert r.status_code == 200


def test_admin_save_banks(tokens):
    baseline = _get_lead(tokens["admin"])
    data = dict(baseline.get("file") or {})
    data["banks"] = [{"bank": "HDFC", "amount": 750000}]
    r = requests.patch(f"{BASE}/leads/{LEAD_ID}/file", headers=_hdr(tokens["admin"]),
                       json={"data": data}, timeout=20)
    assert r.status_code == 200
    banks = (r.json().get("file") or {}).get("banks", [])
    assert any(b.get("bank") == "HDFC" for b in banks)
