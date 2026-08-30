/* ==========================================================================
   TwinAnalytic — list issued EtabsX licences
   --------------------------------------------------------------------------
   Reads the ledger written by api/licence.js and returns it with a status
   worked out per row: active, expiring, expired or perpetual.

   POST, not GET, and passcode-gated exactly as the issuing endpoint is.
   This returns customer names and their licence keys; a GET would sit in
   browser history, proxy logs and the referrer of anything the page later
   loaded. The passcode goes in the body for the same reason.

   The status is computed HERE rather than in the browser so the panel and
   the app agree about what "expiring" means: both read the same expiry
   date, and the threshold below matches RENEW_WARN_DAYS in the app.
   ========================================================================== */

const crypto = require('crypto');
const store = require('./_licence-store');

/* Matches RENEW_WARN_DAYS in auverion_etabsx.py. If these drift, the panel
   and the customer's own sidebar disagree about who needs renewing. */
const WARN_DAYS = 30;

function sha256Hex(v) {
  return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex');
}

function timingSafeEqual(a, b) {
  const A = Buffer.from(String(a), 'utf8');
  const B = Buffer.from(String(b), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* "20270830" -> a Date at the END of that day, matching licence.py, which
   treats a licence as valid through 23:59:59 of its expiry date. Getting
   this wrong by a day would show a licence as expired while the customer's
   copy still works. */
function endOfDay(yyyymmdd) {
  const s = String(yyyymmdd);
  if (!/^\d{8}$/.test(s)) return null;
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6),
                  23, 59, 59);
}

function decorate(rec) {
  const expires = String(rec.expires || '');
  const out = {
    issued_at: rec.issued_at || '',
    machine: rec.machine || '',
    plan: rec.plan || '',
    name: rec.name || '',
    key: rec.key || '',
    expires: expires,
    expires_iso: '',
    days_left: null,
    status: 'unknown'
  };
  if (expires === 'never') {
    out.status = 'perpetual';
    out.expires_iso = 'never';
    return out;
  }
  const end = endOfDay(expires);
  if (!end) return out;
  out.expires_iso = `${expires.slice(0, 4)}-${expires.slice(4, 6)}-${expires.slice(6)}`;
  out.days_left = Math.floor((end - Date.now()) / 86400000);
  out.status = out.days_left < 0 ? 'expired'
             : out.days_left <= WARN_DAYS ? 'expiring' : 'active';
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Use POST. This returns customer keys, so it is not a GET.'
    });
  }

  const passHash = (process.env.ADMIN_PASSCODE_HASH || '').trim().toLowerCase();
  if (!passHash) {
    return res.status(500).json({
      error: 'ADMIN_PASSCODE_HASH is not set on the server.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  if (!timingSafeEqual(sha256Hex(body.passcode || ''), passHash)) {
    await sleep(700);
    return res.status(401).json({ error: 'Wrong passcode.' });
  }

  const cfg = store.config();
  if (!cfg.token) {
    return res.status(200).json({
      licences: [],
      unconfigured: true,
      error: 'GITHUB_TOKEN is not set, so nothing can be recorded or read. ' +
             'Keys already issued are still valid — they simply were not ' +
             'written down. Add the token in Vercel and redeploy; the ledger ' +
             'starts from the next key issued.'
    });
  }

  let data;
  try {
    data = await store.read(cfg);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  const licences = data.records.map(decorate);
  /* Soonest expiry first, because the list exists to answer "who do I chase
     this month". Perpetual and unparseable rows sort last: they never need
     chasing. */
  licences.sort(function (a, b) {
    const ax = a.days_left === null ? Infinity : a.days_left;
    const bx = b.days_left === null ? Infinity : b.days_left;
    return ax - bx;
  });

  return res.status(200).json({
    licences,
    counts: {
      total: licences.length,
      active: licences.filter(l => l.status === 'active').length,
      expiring: licences.filter(l => l.status === 'expiring').length,
      expired: licences.filter(l => l.status === 'expired').length,
      perpetual: licences.filter(l => l.status === 'perpetual').length
    },
    source: `${cfg.owner}/${cfg.repo}/${cfg.path}`,
    warn_days: WARN_DAYS
  });
};
