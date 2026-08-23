/**
 * TwinAnalytic — Google Apps Script for lead capture and read-back
 * ---------------------------------------------------------------------------
 * Paste this into the Apps Script project bound to your leads spreadsheet
 * (Extensions -> Apps Script), replace TOKEN below, then deploy.
 *
 * It does two jobs:
 *
 *   doPost  — receives a submission from the calculator lead form and appends
 *             a row. This is what the site already relies on.
 *   doGet   — returns the sheet as JSON so the control panel can show a real
 *             inbox instead of the current browser's localStorage. Protected
 *             by a shared token, because the sheet holds personal data.
 *
 * If you already have a working doPost, keep yours and add only doGet and the
 * helpers below — but check that your column order matches HEADERS.
 *
 * ---------------------------------------------------------------------------
 * SETUP
 *
 * 1. Replace TOKEN with a long random string. Generate one however you like:
 *      openssl rand -hex 24
 *    Do not reuse your admin passcode.
 *
 * 2. Deploy -> New deployment -> Web app
 *      Execute as:      Me
 *      Who has access:  Anyone
 *
 *    "Anyone" is required: the public form posts without a Google session, and
 *    the Vercel function reads without one. The token is what actually guards
 *    the data, which is why doGet refuses to return anything without it.
 *
 * 3. Copy the deployment URL, then in Vercel -> Settings -> Environment
 *    Variables add:
 *      LEADS_SCRIPT_URL  the deployment URL
 *      LEADS_TOKEN       the same string as TOKEN below
 *    Redeploy, then press "Load from sheet" in the control panel.
 *
 * 4. IMPORTANT: every time you edit this script you must deploy again —
 *    Deploy -> Manage deployments -> edit -> Version: New version. Saving
 *    alone changes nothing at the live URL, which is the single most common
 *    reason a change appears to have no effect.
 * ---------------------------------------------------------------------------
 */

var TOKEN = 'REPLACE_WITH_A_LONG_RANDOM_STRING';

var SHEET_NAME = 'Leads';

/* Column order. Adding a field here adds it to new rows and to the JSON. */
var HEADERS = [
  'timestamp', 'name', 'email', 'country', 'phone',
  'calcType', 'geometry', 'reinforcement', 'status',
  'concreteVol', 'steelWeight'
];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ POST */
/* Called by the calculator lead form. The site posts in no-cors mode and
   cannot read this response, so nothing here should assume it is seen. */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    var sh = sheet_();
    var row = HEADERS.map(function (key) {
      if (key === 'timestamp') {
        return body.timestamp || new Date().toISOString();
      }
      return body[key] === undefined || body[key] === null ? '' : String(body[key]);
    });
    sh.appendRow(row);

    return json_({ ok: true });
  } catch (err) {
    /* Recorded so a failure is visible in Executions even though the browser
       cannot see this response. */
    console.error('doPost failed: ' + err);
    return json_({ error: String(err) });
  }
}

/* ------------------------------------------------------------------- GET */
/* Called by api/leads.js on the server, never by a browser. */
function doGet(e) {
  var params = (e && e.parameter) || {};

  if (TOKEN === 'REPLACE_WITH_A_LONG_RANDOM_STRING') {
    return json_({ error: 'TOKEN has not been set in the Apps Script.' });
  }
  if (params.token !== TOKEN) {
    /* Deliberately vague, and identical whether the token is missing or
       wrong. */
    return json_({ error: 'Not authorised.' });
  }

  try {
    var sh = sheet_();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return json_({ rows: [] });

    var lastCol = Math.max(sh.getLastColumn(), 1);
    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var head = values[0].map(function (h) { return String(h).trim(); });

    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var obj = {};
      var blank = true;
      for (var c = 0; c < head.length; c++) {
        if (!head[c]) continue;
        var v = values[i][c];
        /* Dates come back as Date objects; send them as ISO strings so the
           panel does not have to guess a locale. */
        if (v instanceof Date) v = v.toISOString();
        v = v === null || v === undefined ? '' : String(v);
        if (v !== '') blank = false;
        obj[head[c]] = v;
      }
      if (!blank) rows.push(obj);
    }

    /* Newest first, matching how the panel lists them. */
    rows.reverse();
    return json_({ rows: rows });
  } catch (err) {
    return json_({ error: String(err) });
  }
}
