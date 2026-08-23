/* ==========================================================================
   TwinAnalytic — Leads endpoint (Vercel serverless function)
   --------------------------------------------------------------------------
   Reads the lead rows back out of the Google Sheet so the control panel can
   show a real inbox instead of whatever happens to be in the current
   browser's localStorage.

   Why this sits on the server rather than the panel calling Apps Script
   directly:

     - Apps Script answers a web-app request with a 302 to
       script.googleusercontent.com and sets no CORS headers, so a browser
       fetch either fails outright or is forced into no-cors and returns an
       opaque response. Proxying sidesteps that entirely.
     - The read token stays in a Vercel environment variable. If the panel
       held it, anyone who opened the page source could pull the whole lead
       list.

   Required environment variables:

     LEADS_SCRIPT_URL      The Apps Script web app URL. May be the same
                           deployment the public form posts to, provided that
                           script also implements doGet — see
                           docs/apps-script-leads.gs.
     LEADS_TOKEN           Shared secret. Must match TOKEN in the Apps Script.
     ADMIN_PASSCODE_HASH   SHA-256 hex of the panel passcode. Already set if
                           secure publishing is configured.
   ========================================================================== */

const crypto = require('crypto');

const TIMEOUT_MS = 20000;
const MAX_ROWS = 5000;

function config() {
  return {
    url: (process.env.LEADS_SCRIPT_URL || '').trim(),
    token: (process.env.LEADS_TOKEN || '').trim(),
    passHash: (process.env.ADMIN_PASSCODE_HASH || '').trim().toLowerCase()
  };
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

// Constant time, so response latency cannot be used to guess the passcode.
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Accepts whatever shape the sheet hands back and normalises it to the keys
// the panel already renders, so a column being renamed in the sheet degrades
// to a blank cell rather than breaking the table.
function normalise(row) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
        return String(row[k]).trim();
      }
    }
    return '';
  };
  return {
    name: pick('name', 'Name', 'fullName', 'Full Name'),
    email: pick('email', 'Email', 'Business Email'),
    country: pick('country', 'Country', 'phone', 'Phone'),
    phone: pick('phone', 'Phone', 'country', 'Country'),
    calcType: pick('calcType', 'Calculator', 'source', 'Source', 'calculator'),
    timestamp: pick('timestamp', 'Timestamp', 'date', 'Date'),
    geometry: pick('geometry', 'Geometry'),
    reinforcement: pick('reinforcement', 'Reinforcement'),
    status: pick('status', 'Status'),
    concreteVol: pick('concreteVol', 'Concrete Volume'),
    steelWeight: pick('steelWeight', 'Steel Weight'),
    _source: 'sheet'
  };
}

module.exports = async (req, res) => {
  const cfg = config();
  res.setHeader('Cache-Control', 'no-store');

  // Status probe. The panel calls this on load to decide whether to offer the
  // remote inbox at all. It reveals only whether the server is configured.
  if (req.method === 'GET') {
    return res.status(200).json({
      configured: Boolean(cfg.url && cfg.token && cfg.passHash),
      hasUrl: Boolean(cfg.url),
      hasToken: Boolean(cfg.token),
      hasPasscode: Boolean(cfg.passHash)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use POST to read leads.' });
  }

  if (!cfg.url || !cfg.token || !cfg.passHash) {
    return res.status(503).json({
      error: 'The leads inbox is not configured on the server. Set LEADS_SCRIPT_URL, ' +
             'LEADS_TOKEN and ADMIN_PASSCODE_HASH in your Vercel project settings, then redeploy.'
    });
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Request body is missing.' });
  }

  if (!payload.passcode) {
    await delay(400);
    return res.status(401).json({ error: 'Passcode required.' });
  }
  if (!timingSafeEqual(sha256Hex(payload.passcode), cfg.passHash)) {
    await delay(1000);
    return res.status(401).json({ error: 'That passcode was rejected by the server.' });
  }

  // ---- fetch from Apps Script ---------------------------------------------
  const url = cfg.url + (cfg.url.includes('?') ? '&' : '?') +
              'action=list&token=' + encodeURIComponent(cfg.token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // redirect: 'follow' is required — Apps Script always answers with a 302
    // to script.googleusercontent.com, and the body lives at the target.
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'twinanalytic-admin' }
    });
    const text = await r.text();

    if (!r.ok) {
      return res.status(502).json({ error: `The Apps Script responded ${r.status}.` });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // A sign-in page rather than JSON is the usual symptom of a deployment
      // whose access is not set to "Anyone".
      const looksLikeHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(text);
      return res.status(502).json({
        error: looksLikeHtml
          ? 'The Apps Script returned a web page rather than data. Redeploy it with ' +
            'Execute as "Me" and Who has access set to "Anyone".'
          : 'The Apps Script returned something that is not JSON.'
      });
    }

    if (parsed && parsed.error) {
      return res.status(502).json({ error: `Apps Script: ${parsed.error}` });
    }

    const rows = Array.isArray(parsed) ? parsed
               : Array.isArray(parsed.rows) ? parsed.rows
               : Array.isArray(parsed.leads) ? parsed.leads
               : null;
    if (!rows) {
      return res.status(502).json({ error: 'The Apps Script did not return a list of rows.' });
    }

    const leads = rows.slice(0, MAX_ROWS)
      .map(normalise)
      .filter((l) => l.email || l.name);

    return res.status(200).json({ ok: true, count: leads.length, leads });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'The Apps Script did not respond in time.' });
    }
    return res.status(502).json({ error: `Could not reach the Apps Script: ${err.message}` });
  } finally {
    clearTimeout(timer);
  }
};
