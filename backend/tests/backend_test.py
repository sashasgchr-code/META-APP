"""Bankezee CRM Backend API tests - iteration 2.

Covers new features:
- Register returns pending status (no session), pending partner cannot login
- Admin approves partner -> partner can login
- Admin password change invalidates sessions
- User Management endpoints (list users, visible_password, approve, password)
- Bulk assign endpoint (admin only)
- Ops role: sees all leads + stats, no assign / user mgmt / bulk-assign
- Role isolation: /users, /partners, /leads/bulk-assign, assign -> 403 for non-admin
- Leads pagination shape {items,total,pages}
- CONVERTED triggers notify_staff_converted (verify via updated status only; log side effect)
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

# Unique test partner per run
PARTNER_EMAIL = f"TEST_partner_{uuid.uuid4().hex[:8]}@example.com"
PARTNER_PASSWORD = "Partner@123456"


def h(token):
    return {"Authorization": f"Bearer {token}"}


def _fresh_partner_token(admin_token, uid):
    """Re-fetch a valid partner session token (used after password-change tests invalidated the fixture token)."""
    users = requests.get(f"{API}/users", headers=h(admin_token)).json()
    u = next(x for x in users if x["user_id"] == uid)
    r = requests.post(f"{API}/auth/login", json={"email": u["email"], "password": u["visible_password"]})
    assert r.status_code == 200, f"Fresh partner login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="session")
def ops_token():
    r = requests.post(f"{API}/auth/login", json={"email": OPS_EMAIL, "password": OPS_PASSWORD})
    assert r.status_code == 200, f"Ops login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "ops"
    return data["session_token"]


@pytest.fixture(scope="session")
def pending_partner():
    """Register a fresh growth partner and return the register response (pending)."""
    r = requests.post(f"{API}/auth/register", json={
        "name": "TEST Partner",
        "email": PARTNER_EMAIL,
        "password": PARTNER_PASSWORD,
        "phone": "9999999999",
    })
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def approved_partner(admin_token, pending_partner):
    """Approve the pending partner via admin and return (token, user_id)."""
    # Find user_id via /api/users
    r = requests.get(f"{API}/users", headers=h(admin_token))
    assert r.status_code == 200
    users = r.json()
    target = next((u for u in users if u["email"] == PARTNER_EMAIL.lower()), None)
    assert target is not None, "Registered partner not found in /users"
    uid = target["user_id"]

    # Approve
    r = requests.patch(f"{API}/users/{uid}/approve", headers=h(admin_token), json={"approved": True})
    assert r.status_code == 200
    assert r.json()["approved"] is True

    # Login should now succeed
    r = requests.post(f"{API}/auth/login", json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD})
    assert r.status_code == 200, f"Approved partner login failed: {r.status_code} {r.text}"
    return r.json()["session_token"], uid


# ---------------- Register / Login (new behaviour) ----------------
class TestRegisterApprovalFlow:
    def test_register_returns_pending_no_session(self, pending_partner):
        assert pending_partner.get("status") == "pending"
        assert "session_token" not in pending_partner
        assert "user" not in pending_partner

    def test_pending_partner_cannot_login(self, pending_partner):
        r = requests.post(f"{API}/auth/login", json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD})
        assert r.status_code == 403
        assert "pending" in r.json().get("detail", "").lower()

    def test_duplicate_register_rejected(self, pending_partner):
        r = requests.post(f"{API}/auth/register", json={
            "name": "dup", "email": PARTNER_EMAIL, "password": "x", "phone": ""
        })
        assert r.status_code == 400

    def test_admin_approve_then_partner_login(self, approved_partner):
        token, uid = approved_partner
        assert token.startswith("sess_")


# ---------------- User Management (admin) ----------------
class TestUserManagement:
    def test_users_list_admin(self, admin_token):
        r = requests.get(f"{API}/users", headers=h(admin_token))
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 2
        # visible_password is exposed for password users; hash never
        emails = {u["email"] for u in users}
        assert ADMIN_EMAIL in emails and OPS_EMAIL in emails
        assert all("password_hash" not in u for u in users)
        # At least one user has visible_password
        assert any(u.get("visible_password") for u in users)

    def test_users_forbidden_for_ops(self, ops_token):
        r = requests.get(f"{API}/users", headers=h(ops_token))
        assert r.status_code == 403

    def test_users_forbidden_for_partner(self, admin_token, approved_partner):
        _, uid = approved_partner
        token = _fresh_partner_token(admin_token, uid)
        r = requests.get(f"{API}/users", headers=h(token))
        assert r.status_code == 403

    def test_admin_change_password_invalidates_session(self, admin_token, approved_partner):
        old_token, uid = approved_partner
        new_pw = "NewPw@" + uuid.uuid4().hex[:6]
        r = requests.patch(f"{API}/users/{uid}/password", headers=h(admin_token),
                           json={"password": new_pw})
        assert r.status_code == 200

        # Old session must be invalidated
        r = requests.get(f"{API}/auth/me", headers=h(old_token))
        assert r.status_code == 401

        # Old password no longer works
        r = requests.post(f"{API}/auth/login", json={"email": PARTNER_EMAIL, "password": PARTNER_PASSWORD})
        assert r.status_code == 401

        # New password logs in
        r = requests.post(f"{API}/auth/login", json={"email": PARTNER_EMAIL, "password": new_pw})
        assert r.status_code == 200

    def test_password_too_short(self, admin_token, approved_partner):
        _, uid = approved_partner
        r = requests.patch(f"{API}/users/{uid}/password", headers=h(admin_token), json={"password": "abc"})
        assert r.status_code == 400

    def test_admin_revoke_then_partner_cannot_login(self, admin_token, approved_partner):
        _, uid = approved_partner
        # Revoke
        r = requests.patch(f"{API}/users/{uid}/approve", headers=h(admin_token), json={"approved": False})
        assert r.status_code == 200
        # Get current pw from /users
        users = requests.get(f"{API}/users", headers=h(admin_token)).json()
        cur = next(u for u in users if u["user_id"] == uid)
        cur_pw = cur["visible_password"]
        r = requests.post(f"{API}/auth/login", json={"email": PARTNER_EMAIL, "password": cur_pw})
        assert r.status_code == 403
        # Re-approve for later tests
        requests.patch(f"{API}/users/{uid}/approve", headers=h(admin_token), json={"approved": True})


# ---------------- Leads (pagination + ops visibility) ----------------
class TestLeadsListing:
    def test_list_admin_paginated_shape(self, admin_token):
        r = requests.get(f"{API}/leads?page=1&page_size=25", headers=h(admin_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("items", "total", "page", "page_size", "pages"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["items"], list)
        assert d["total"] > 0
        assert d["page"] == 1 and d["page_size"] == 25
        assert len(d["items"]) <= 25

    def test_ops_sees_all_leads(self, admin_token, ops_token):
        a = requests.get(f"{API}/leads?page=1&page_size=1", headers=h(admin_token)).json()
        o = requests.get(f"{API}/leads?page=1&page_size=1", headers=h(ops_token)).json()
        assert a["total"] == o["total"] and a["total"] > 0

    def test_ops_stats(self, ops_token):
        r = requests.get(f"{API}/leads/stats", headers=h(ops_token))
        assert r.status_code == 200
        d = r.json()
        assert d["total"] > 0
        for s in ["NEW", "CONTACTED", "CALLED", "CONVERTED", "REJECTED"]:
            assert s in d["by_status"]


# ---------------- Bulk Assign ----------------
class TestBulkAssign:
    def test_bulk_assign_admin(self, admin_token, approved_partner):
        _, uid = approved_partner
        # Pick 3 unassigned leads
        r = requests.get(f"{API}/leads?partner=UNASSIGNED&page=1&page_size=3", headers=h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1, "need at least 1 unassigned lead"
        lead_ids = [x["lead_id"] for x in items]

        r = requests.post(f"{API}/leads/bulk-assign", headers=h(admin_token),
                          json={"lead_ids": lead_ids, "partner_id": uid})
        assert r.status_code == 200
        assert r.json()["modified"] == len(lead_ids)

        # Verify persistence
        for lid in lead_ids:
            g = requests.get(f"{API}/leads/{lid}", headers=h(admin_token))
            assert g.status_code == 200
            assert g.json()["assigned_partner_id"] == uid

    def test_bulk_assign_forbidden_ops(self, ops_token):
        r = requests.post(f"{API}/leads/bulk-assign", headers=h(ops_token),
                          json={"lead_ids": ["x"], "partner_id": None})
        assert r.status_code == 403

    def test_bulk_assign_forbidden_partner(self, admin_token, approved_partner):
        _, uid = approved_partner
        token = _fresh_partner_token(admin_token, uid)
        r = requests.post(f"{API}/leads/bulk-assign", headers=h(token),
                          json={"lead_ids": ["x"], "partner_id": None})
        assert r.status_code == 403

    def test_bulk_assign_empty(self, admin_token):
        r = requests.post(f"{API}/leads/bulk-assign", headers=h(admin_token),
                          json={"lead_ids": [], "partner_id": None})
        assert r.status_code == 400


# ---------------- Role isolation on admin endpoints ----------------
class TestRoleIsolation:
    def test_partners_forbidden_for_ops(self, ops_token):
        r = requests.get(f"{API}/partners", headers=h(ops_token))
        assert r.status_code == 403

    def test_partners_forbidden_for_partner(self, admin_token, approved_partner):
        _, uid = approved_partner
        token = _fresh_partner_token(admin_token, uid)
        r = requests.get(f"{API}/partners", headers=h(token))
        assert r.status_code == 403

    def test_assign_forbidden_for_ops(self, ops_token, admin_token):
        items = requests.get(f"{API}/leads?page=1&page_size=1", headers=h(admin_token)).json()["items"]
        lid = items[0]["lead_id"]
        r = requests.patch(f"{API}/leads/{lid}/assign", headers=h(ops_token), json={"partner_id": None})
        assert r.status_code == 403


# ---------------- CONVERTED (email notification triggered) ----------------
class TestConvertedNotification:
    def test_mark_lead_converted(self, admin_token, approved_partner):
        _, uid = approved_partner
        # Pick a lead assigned to partner (from bulk assign) or any lead
        items = requests.get(f"{API}/leads?page=1&page_size=1", headers=h(admin_token)).json()["items"]
        lid = items[0]["lead_id"]
        r = requests.patch(f"{API}/leads/{lid}/status", headers=h(admin_token), json={"status": "CONVERTED"})
        assert r.status_code == 200
        assert r.json()["status"] == "CONVERTED"
        # Email side-effect is async and logged; not asserted here (see backend logs).
