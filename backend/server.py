from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import csv
import re
import hmac
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
import bcrypt
import httpx
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

SHEET_ID = os.environ.get('GOOGLE_SHEET_ID', '1Ugq8BpctyY0ZdqxCknR1OdWGvvUW9Xa1FKBzs_Gyy_4')
SHEET_CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0"
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'sasha.sgchr@gmail.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin@123456')
WEBHOOK_CRON_SECRET = os.environ.get('WEBHOOK_CRON_SECRET', '')
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "BankEzee CRM")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "")

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

CRM_STATUSES = ["NEW", "CONTACTED", "CALLED", "CONVERTED", "REJECTED"]
SHEET_STATUS_MAP = {"CREATED": "NEW", "CALLED": "CALLED", "CONTACTED": "CONTACTED", "CONVERTED": "CONVERTED", "REJECTED": "REJECTED"}


# ------------------- Models -------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = ""

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    user_id: str
    email: str
    name: str
    role: str = "growth_partner"
    phone: Optional[str] = ""
    picture: Optional[str] = ""
    auth_provider: str = "password"
    created_at: str

class LeadUpdate(BaseModel):
    status: Optional[str] = None

class AssignInput(BaseModel):
    partner_id: Optional[str] = None

class NoteInput(BaseModel):
    text: str


# ------------------- Helpers -------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def now_iso():
    return datetime.now(timezone.utc).isoformat()

async def create_session(user_id: str) -> str:
    token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": now_iso(),
    })
    return token

def set_session_cookie(response: Response, token: str):
    response.set_cookie(key="session_token", value=token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=7 * 24 * 60 * 60)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ------------------- Email (Resend via Emergent proxy) -------------------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    async with httpx.AsyncClient(timeout=30) as hc:
        resp = await hc.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                             headers={"X-Email-Key": EMAIL_KEY}, json=payload)
    resp.raise_for_status()
    return resp.json().get("id")


async def notify_partner_assignment(partner: dict, lead: dict, admin_name: str):
    if not partner.get("email") or not EMAIL_KEY:
        return
    try:
        lead_url = f"{APP_BASE_URL}/leads/{lead['lead_id']}"
        subject = f"New lead assigned to you — {lead.get('full_name') or 'Lead'}"
        html = (
            f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#0f172a">'
            f'<h2 style="color:#0F52BA;margin:0 0 12px">New Lead Assigned</h2>'
            f'<p>Hi {escape(partner["name"])},</p>'
            f'<p>{escape(admin_name)} has assigned a new lead to you in {escape(EMAIL_FROM_NAME)}.</p>'
            f'<table role="presentation" style="margin:16px 0;font-size:14px">'
            f'<tr><td style="padding:4px 12px 4px 0;color:#64748b">Name</td><td><strong>{escape(lead.get("full_name") or "-")}</strong></td></tr>'
            f'<tr><td style="padding:4px 12px 4px 0;color:#64748b">Phone</td><td>{escape(lead.get("phone") or "-")}</td></tr>'
            f'<tr><td style="padding:4px 12px 4px 0;color:#64748b">City</td><td>{escape(lead.get("city") or "-")}</td></tr>'
            f'<tr><td style="padding:4px 12px 4px 0;color:#64748b">Loan Profile</td><td>{escape(lead.get("employment_status") or "-")} · {escape(lead.get("outstanding_amount") or "-")}</td></tr>'
            f'</table>'
            f'<p><a href="{escape(lead_url)}" style="background:#0F52BA;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">View lead in BankEzee CRM</a></p>'
            f'<p style="font-size:12px;color:#888;margin-top:24px">Sent by {escape(EMAIL_FROM_NAME)}. We never ask for your password or card details by email.</p>'
            f'</td></tr></table>'
        )
        await send_email(to=partner["email"], subject=subject, html=html)
        logger.info(f"Assignment email sent to {partner['email']}")
    except Exception as e:
        logger.error(f"Assignment email failed: {e}")


# ------------------- Google Sheet import -------------------
def clean_phone(raw: str) -> str:
    if not raw:
        return ""
    return raw.replace("p:", "").strip()

def pretty(val: str) -> str:
    if not val:
        return ""
    return val.replace("_", " ").strip()

async def fetch_sheet_rows() -> List[dict]:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as hc:
        resp = await hc.get(SHEET_CSV_URL)
        resp.raise_for_status()
        text = resp.text
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for r in reader:
        if not r.get("id"):
            continue
        # Skip Meta test/organic dummy leads
        if (r.get("is_organic", "").strip().lower() == "true"):
            continue
        name = (r.get("full_name") or "")
        if "test lead" in name.lower() or "<test" in name.lower():
            continue
        if (r.get("email") or "").strip().lower() == "test@meta.com":
            continue
        rows.append(r)
    return rows

async def sync_leads_from_sheet() -> dict:
    rows = await fetch_sheet_rows()
    imported, updated = 0, 0
    for r in rows:
        sheet_id = r.get("id", "").strip()
        if not sheet_id:
            continue
        existing = await db.leads.find_one({"sheet_id": sheet_id}, {"_id": 0, "sheet_id": 1})
        sheet_status = (r.get("lead_status") or "CREATED").strip().upper()
        base = {
            "sheet_id": sheet_id,
            "created_time": r.get("created_time", ""),
            "full_name": r.get("full_name", "").strip(),
            "phone": clean_phone(r.get("phone_number", "")),
            "email": r.get("email", "").strip(),
            "city": r.get("city", "").strip(),
            "employment_status": pretty(r.get("please_select_your_current_employment_status", "")),
            "monthly_salary": pretty(r.get("what_is_your_current_monthly_take-home_salary?", "")),
            "outstanding_amount": pretty(r.get("what_is_the_total_outstanding_amount_of_your_loans_and_credit_card_bills?", "")),
            "campaign_name": r.get("campaign_name", "").strip(),
            "form_name": r.get("form_name", "").strip(),
            "platform": r.get("platform", "").strip(),
            "sheet_status": sheet_status,
        }
        if existing:
            await db.leads.update_one({"sheet_id": sheet_id}, {"$set": {**base, "updated_at": now_iso()}})
            updated += 1
        else:
            doc = {
                **base,
                "lead_id": f"lead_{uuid.uuid4().hex[:12]}",
                "status": SHEET_STATUS_MAP.get(sheet_status, "NEW"),
                "assigned_partner_id": None,
                "assigned_partner_name": None,
                "notes": [],
                "activities": [{"type": "imported", "detail": "Lead imported from Google Sheet", "at": now_iso()}],
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            await db.leads.insert_one(doc)
            imported += 1
    await db.meta.update_one({"key": "last_sync"}, {"$set": {"key": "last_sync", "at": now_iso(),
                            "imported": imported, "updated": updated}}, upsert=True)
    logger.info(f"Sheet sync complete: {imported} new, {updated} updated")
    return {"imported": imported, "updated": updated, "total_rows": len(rows)}


# ------------------- Auth routes -------------------
@api_router.post("/auth/register")
async def register(inp: RegisterInput, response: Response):
    existing = await db.users.find_one({"email": inp.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": inp.email.lower(),
        "name": inp.name.strip(),
        "role": "growth_partner",
        "phone": inp.phone or "",
        "picture": "",
        "auth_provider": "password",
        "password_hash": hash_password(inp.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    token = await create_session(user_id)
    set_session_cookie(response, token)
    return {"session_token": token, "user": {k: v for k, v in doc.items() if k not in ("password_hash", "_id")}}

@api_router.post("/auth/login")
async def login(inp: LoginInput, response: Response):
    user = await db.users.find_one({"email": inp.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(inp.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await create_session(user["user_id"])
    set_session_cookie(response, token)
    return {"session_token": token, "user": {k: v for k, v in user.items() if k not in ("password_hash", "_id")}}

@api_router.post("/auth/session")
async def google_session(response: Response, x_session_id: Optional[str] = Header(None)):
    if not x_session_id:
        raise HTTPException(status_code=400, detail="Missing session id")
    async with httpx.AsyncClient(timeout=30) as hc:
        r = await hc.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": x_session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session id")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email})
    if user:
        await db.users.update_one({"email": email}, {"$set": {"name": data.get("name", user["name"]),
                                  "picture": data.get("picture", ""), "auth_provider": "google"}})
        user_id = user["user_id"]
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        role = "admin" if email == ADMIN_EMAIL.lower() else "growth_partner"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": data.get("name", email),
            "role": role, "phone": "", "picture": data.get("picture", ""),
            "auth_provider": "google", "created_at": now_iso(),
        })
    token = await create_session(user_id)
    set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"session_token": token, "user": user}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ------------------- Leads routes -------------------
@api_router.post("/leads/sync")
async def manual_sync(user: dict = Depends(get_current_user)):
    result = await sync_leads_from_sheet()
    return result

SORT_FIELDS = {"created_time", "full_name", "city", "status"}


@api_router.get("/leads")
async def list_leads(request: Request, status: Optional[str] = None, q: Optional[str] = None,
                     partner: Optional[str] = None, page: int = 1, page_size: int = 25,
                     sort_by: str = "created_time", sort_dir: str = "desc",
                     user: dict = Depends(get_current_user)):
    query = {}
    if user.get("role") != "admin":
        query["assigned_partner_id"] = user["user_id"]
    if status and status != "ALL":
        query["status"] = status
    if partner and partner != "ALL" and user.get("role") == "admin":
        query["assigned_partner_id"] = None if partner == "UNASSIGNED" else partner
    if q:
        rx = re.escape(q)
        query["$or"] = [{"full_name": {"$regex": rx, "$options": "i"}},
                        {"email": {"$regex": rx, "$options": "i"}},
                        {"phone": {"$regex": rx, "$options": "i"}},
                        {"city": {"$regex": rx, "$options": "i"}}]
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    if sort_by not in SORT_FIELDS:
        sort_by = "created_time"
    direction = 1 if sort_dir == "asc" else -1
    total = await db.leads.count_documents(query)
    cursor = db.leads.find(query, {"_id": 0}).sort(sort_by, direction).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size)}

@api_router.get("/leads/stats")
async def lead_stats(user: dict = Depends(get_current_user)):
    match = {}
    if user.get("role") != "admin":
        match["assigned_partner_id"] = user["user_id"]
    total = await db.leads.count_documents(match)
    by_status = {}
    for s in CRM_STATUSES:
        by_status[s] = await db.leads.count_documents({**match, "status": s})
    unassigned = await db.leads.count_documents({**match, "assigned_partner_id": None})
    last_sync = await db.meta.find_one({"key": "last_sync"}, {"_id": 0})
    # leads per city top 5
    pipeline = [{"$match": match}, {"$group": {"_id": "$city", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}, {"$limit": 6}]
    by_city = [{"city": d["_id"] or "Unknown", "count": d["count"]} async for d in db.leads.aggregate(pipeline)]
    return {"total": total, "by_status": by_status, "unassigned": unassigned,
            "last_sync": last_sync, "by_city": by_city}

@api_router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and lead.get("assigned_partner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    return lead

@api_router.patch("/leads/{lead_id}/status")
async def update_status(lead_id: str, inp: LeadUpdate, user: dict = Depends(get_current_user)):
    if inp.status not in CRM_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and lead.get("assigned_partner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    activity = {"type": "status_change", "detail": f"Status changed from {lead['status']} to {inp.status} by {user['name']}", "at": now_iso()}
    await db.leads.update_one({"lead_id": lead_id}, {"$set": {"status": inp.status, "updated_at": now_iso()},
                              "$push": {"activities": activity}})
    return await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})

@api_router.patch("/leads/{lead_id}/assign")
async def assign_lead(lead_id: str, inp: AssignInput, user: dict = Depends(require_admin)):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    partner_name = None
    if inp.partner_id:
        partner = await db.users.find_one({"user_id": inp.partner_id}, {"_id": 0})
        if not partner:
            raise HTTPException(status_code=404, detail="Partner not found")
        partner_name = partner["name"]
        detail = f"Assigned to {partner_name} by {user['name']}"
    else:
        detail = f"Unassigned by {user['name']}"
    activity = {"type": "assignment", "detail": detail, "at": now_iso()}
    await db.leads.update_one({"lead_id": lead_id}, {"$set": {"assigned_partner_id": inp.partner_id,
                              "assigned_partner_name": partner_name, "updated_at": now_iso()},
                              "$push": {"activities": activity}})
    updated = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if inp.partner_id and partner:
        asyncio.create_task(notify_partner_assignment(partner, updated, user["name"]))
    return updated

@api_router.post("/leads/{lead_id}/notes")
async def add_note(lead_id: str, inp: NoteInput, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if user.get("role") != "admin" and lead.get("assigned_partner_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    note = {"text": inp.text, "author": user["name"], "at": now_iso()}
    activity = {"type": "note", "detail": f"{user['name']} added a note", "at": now_iso()}
    await db.leads.update_one({"lead_id": lead_id}, {"$push": {"notes": note, "activities": activity},
                              "$set": {"updated_at": now_iso()}})
    return await db.leads.find_one({"lead_id": lead_id}, {"_id": 0})


# ------------------- Partners routes -------------------
@api_router.get("/partners")
async def list_partners(user: dict = Depends(require_admin)):
    partners = await db.users.find({"role": "growth_partner"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for p in partners:
        p["assigned_leads"] = await db.leads.count_documents({"assigned_partner_id": p["user_id"]})
        p["converted_leads"] = await db.leads.count_documents({"assigned_partner_id": p["user_id"], "status": "CONVERTED"})
    return partners


# ------------------- Cron route -------------------
@api_router.post("/cron/sync-leads")
async def cron_sync(request: Request, authorization: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    expected = f"Bearer {WEBHOOK_CRON_SECRET}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(sync_leads_from_sheet())
    return {"accepted": True}


@api_router.get("/")
async def root():
    return {"message": "Bankezee CRM API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def seed_admin():
    await db.leads.create_index("sheet_id", unique=True, sparse=True)
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    admin = await db.users.find_one({"email": ADMIN_EMAIL.lower()})
    if not admin:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": ADMIN_EMAIL.lower(),
            "name": "Admin",
            "role": "admin",
            "phone": "",
            "picture": "",
            "auth_provider": "password",
            "password_hash": hash_password(ADMIN_PASSWORD),
            "created_at": now_iso(),
        })
        logger.info(f"Seeded admin: {ADMIN_EMAIL}")
    # Initial sheet import if empty
    count = await db.leads.count_documents({})
    if count == 0:
        try:
            await sync_leads_from_sheet()
        except Exception as e:
            logger.error(f"Initial sheet sync failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
