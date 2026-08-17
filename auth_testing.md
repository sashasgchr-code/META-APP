# Auth Testing Playbook (Bankezee CRM)

Two auth methods share one session system (`user_sessions.session_token`, 7-day expiry).
`get_current_user` checks the `session_token` cookie first, then `Authorization: Bearer <token>`.

## Email/password (primary for testing)
Admin: sasha.sgchr@gmail.com / Admin@123456 (role admin)
Register a growth partner: POST /api/auth/register {name,email,password,phone}
Login: POST /api/auth/login {email,password} -> returns {session_token, user}

Use the returned session_token as Bearer:
  curl -H "Authorization: Bearer <token>" $URL/api/auth/me
  curl -H "Authorization: Bearer <token>" $URL/api/leads

## Google OAuth (Emergent)
Frontend redirects to https://auth.emergentagent.com/?redirect=<origin>/dashboard
Callback lands at /dashboard#session_id=... ; AuthCallback POSTs X-Session-ID to /api/auth/session.
For automated testing, prefer creating a session directly in Mongo:

mongosh --eval "
use('test_database');
var uid = (db.users.findOne({email:'sasha.sgchr@gmail.com'})||{}).user_id;
var t = 'test_session_' + Date.now();
db.user_sessions.insertOne({session_token:t, user_id:uid, expires_at:new Date(Date.now()+7*24*3600*1000).toISOString(), created_at:new Date().toISOString()});
print(t);
"

## Checklist
- /api/auth/me returns user (not 401)
- /api/leads returns leads for admin (all) and only assigned leads for growth_partner
- Assign endpoint is admin-only (403 for growth_partner)
