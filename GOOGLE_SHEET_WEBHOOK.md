# Instant Sheet → CRM Webhook (Google Apps Script)

This makes a new row (e.g. a Meta lead form submission landing in the Sheet) push into
BankEzee CRM within a few seconds, instead of waiting for the 2-minute auto-sync.
The 2-minute auto-sync stays on as a safety net.

## Endpoint (already in the app)
POST https://meta.bankezee.com/api/webhook/sheet-sync?token=YOUR_SECRET
- Returns {"accepted": true} and triggers an immediate sheet sync.
- Bursts within 5 seconds are debounced (coalesced into one sync).

> IMPORTANT: Redeploy the CRM to production first, so this new endpoint is live at meta.bankezee.com.

## One-time setup in your Google Sheet
1. Open the Google Sheet that receives the Meta leads.
2. Menu: **Extensions → Apps Script**.
3. Delete any starter code, paste the script below.
4. Click **Save**.
5. In the function dropdown (top toolbar) choose **createTrigger**, click **Run**.
   - Google will ask you to authorize the script — approve it (choose your account → Advanced → Allow).
6. Done. Add a test row to the sheet; within a few seconds it should appear in the CRM Leads.

## Script
```javascript
// ==== BankEzee CRM webhook ====
const CRM_WEBHOOK_URL = "https://meta.bankezee.com/api/webhook/sheet-sync";
const CRM_SECRET = "bankezee_cron_7f3a9c1e5b2d4a8f6e0c9d2b1a4f7e3c";

// Fired on any change to the spreadsheet (including new rows appended by the Meta integration)
function notifyCRM() {
  try {
    UrlFetchApp.fetch(CRM_WEBHOOK_URL + "?token=" + encodeURIComponent(CRM_SECRET), {
      method: "post",
      contentType: "application/json",
      payload: "{}",
      muteHttpExceptions: true
    });
  } catch (err) {
    console.error("CRM webhook failed: " + err);
  }
}

// Run this ONCE to install the trigger
function createTrigger() {
  // remove old copies so we don't stack duplicates
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "notifyCRM") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("notifyCRM")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
}
```

## If new rows don't trigger it (some external connectors don't fire onChange)
Certain Meta→Sheets connectors append rows via the API in a way that doesn't fire `onChange`.
If you notice the instant push isn't firing, use a guaranteed time-based trigger instead:
- In Apps Script: click the **clock icon (Triggers)** → **Add Trigger**
  - Function: `notifyCRM`
  - Event source: **Time-driven** → **Minutes timer** → **Every minute**
- This pings the CRM every minute (near-real-time) regardless of how rows are added.

Either way, the CRM's built-in 2-minute auto-sync still runs as a backstop.
