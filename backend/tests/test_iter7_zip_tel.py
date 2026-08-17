"""Iteration 7: Documents ZIP download + tel: links (backend part).

Verifies:
- GET /api/leads/{id}/documents/zip returns application/zip for admin
- Growth partner receives 403 on the same endpoint
- Single document download endpoint still works (route ordering intact:
  literal 'zip' must not be treated as a doc_id).
"""
import io
import os
import zipfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "sasha.sgchr@gmail.com", "password": "Admin@123456"}
OPS = {"email": "rama.saffronglobal@gmail.com", "password": "Ops@123456"}
PARTNER = {"email": "priya@example.com", "password": "Priya@123456"}
FILE_LEAD_ID = "lead_55772c498293"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["session_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def partner_headers():
    return {"Authorization": f"Bearer {_login(PARTNER)}"}


class TestDocumentsZip:
    def test_admin_zip_download(self, admin_headers):
        r = requests.get(f"{API}/leads/{FILE_LEAD_ID}/documents/zip",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/zip")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        # Validate ZIP contents
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = zf.namelist()
        assert len(names) >= 1, f"empty zip: {names}"
        # Ensure at least one entry is non-empty
        assert any(zf.getinfo(n).file_size > 0 for n in names)

    def test_partner_forbidden(self, partner_headers):
        r = requests.get(f"{API}/leads/{FILE_LEAD_ID}/documents/zip",
                         headers=partner_headers, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"

    def test_single_doc_download_still_works(self, admin_headers):
        # Fetch lead to obtain a real doc_id
        r = requests.get(f"{API}/leads/{FILE_LEAD_ID}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        docs = r.json().get("documents", [])
        assert docs, "expected FILE lead to have at least one document"
        doc_id = docs[0]["doc_id"]
        d = requests.get(f"{API}/leads/{FILE_LEAD_ID}/documents/{doc_id}",
                         headers=admin_headers, timeout=20)
        assert d.status_code == 200, d.text
        ctype = d.headers.get("content-type", "")
        assert not ctype.startswith("application/zip"), \
            f"single doc endpoint should not return zip, got {ctype}"
        assert len(d.content) > 0

    def test_zip_literal_not_treated_as_doc_id(self, admin_headers):
        # Route ordering: hitting /documents/zip must hit the zip handler,
        # not fall through and 404 as doc_id "zip".
        r = requests.get(f"{API}/leads/{FILE_LEAD_ID}/documents/zip",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/zip")
