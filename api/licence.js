/* ==========================================================================
   TwinAnalytic — EtabsX licence issuing endpoint (Vercel serverless)
   --------------------------------------------------------------------------
   Signs an EtabsX licence key for one machine. This is the labour-saving
   half of the semi-automated flow: a human still checks that the bKash or
   bank payment actually arrived, and this does everything after that.

   The signing key never reaches the browser. It lives in a Vercel
   environment variable and is read only here, on the server — the same
   arrangement as the GitHub token in publish.js, and for the same reason:
   anyone holding it can issue a licence for any machine.

   Node's crypto has native Ed25519, so this needs no dependency. It must
   produce byte-for-byte what licence_tool.py produces, because the app
   verifies both with the same public key:

       TWX1.<base64url(payload json)>.<base64url(64-byte signature)>

   Required environment variables:

     LICENCE_PRIVATE_KEY   base64 of the 32-byte Ed25519 seed — the contents
                           of licence_private.key from `licence_tool.py
                           keygen`. Never commit it, never expose it to the
                           client, and back it up: losing it means you can
                           no longer issue or renew anything.
     ADMIN_PASSCODE_HASH   SHA-256 hex of the admin passcode, as publish.js.
   ========================================================================== */

const crypto = require('crypto');

/* Matches PLANS in licence_tool.py. Kept in both because the tool must work
   offline when this endpoint is not reachable. */
const PLANS = { project: 30, quarterly: 90, annual: 365, perpetual: null };

const MACHINE_RE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

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

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* A raw Ed25519 seed is not something createPrivateKey accepts directly, so
   it is wrapped in the fixed PKCS#8 prefix for Ed25519 (RFC 8410). The
   prefix is constant; only the 32 seed bytes vary. */
function privateKeyFromSeed(seed) {
  if (seed.length !== 32) throw new Error('seed must be 32 bytes');
  const der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed
  ]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

function yyyymmdd(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/* The signed body. Key order is fixed and alphabetical, and there is no
   whitespace, so it matches what Python's json.dumps(sort_keys=True,
   separators=(',',':')) produces for the same values. */
function payloadBytes(machine, expires, plan, name) {
  return Buffer.from(JSON.stringify({
    e: plan, m: machine, n: name || '', x: expires
  }), 'utf8');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  const passHash = (process.env.ADMIN_PASSCODE_HASH || '').trim().toLowerCase();
  const seedB64 = (process.env.LICENCE_PRIVATE_KEY || '').trim();

  if (!passHash) {
    return res.status(500).json({
      error: 'ADMIN_PASSCODE_HASH is not set on the server.'
    });
  }
  if (!seedB64) {
    return res.status(500).json({
      error: 'LICENCE_PRIVATE_KEY is not set. Run "python licence_tool.py ' +
             'keygen", then paste the contents of licence_private.key into ' +
             'the Vercel environment variable.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  if (!timingSafeEqual(sha256Hex(body.passcode || ''), passHash)) {
    await sleep(700);              // same deliberate pause as publish.js
    return res.status(401).json({ error: 'Wrong passcode.' });
  }

  const machine = String(body.machine || '').trim().toUpperCase();
  if (!MACHINE_RE.test(machine)) {
    return res.status(400).json({
      error: 'Machine code must look like ABCD-1234-EF56-7890 — sixteen ' +
             'hex characters in four groups. Copy it from the customer\'s ' +
             'EtabsX window rather than retyping it.'
    });
  }

  const plan = String(body.plan || 'annual').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PLANS, plan)) {
    return res.status(400).json({
      error: 'Unknown plan. One of: ' + Object.keys(PLANS).join(', ')
    });
  }

  /* A name is printed back to the customer inside the app, so it is length
     capped and stripped of control characters rather than trusted. */
  const name = String(body.name || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 60);

  let expires;
  if (body.expires && /^\d{8}$/.test(String(body.expires))) {
    expires = String(body.expires);
  } else if (PLANS[plan] === null) {
    expires = 'never';
  } else {
    const days = Number.isFinite(+body.days) && +body.days > 0
      ? Math.min(+body.days, 3650) : PLANS[plan];
    expires = yyyymmdd(new Date(Date.now() + days * 86400000));
  }

  let key;
  try {
    const seed = Buffer.from(seedB64, 'base64');
    const pk = privateKeyFromSeed(seed);
    const bodyBytes = payloadBytes(machine, expires, plan, name);
    const sig = crypto.sign(null, bodyBytes, pk);   // null = Ed25519 is pure
    key = `TWX1.${b64url(bodyBytes)}.${b64url(sig)}`;
  } catch (e) {
    return res.status(500).json({
      error: 'Could not sign the licence. Check that LICENCE_PRIVATE_KEY is ' +
             'the base64 of a 32-byte seed. (' + e.message + ')'
    });
  }

  return res.status(200).json({
    key,
    machine,
    plan,
    expires: expires === 'never' ? 'never'
      : `${expires.slice(0, 4)}-${expires.slice(4, 6)}-${expires.slice(6)}`,
    name
  });
};
