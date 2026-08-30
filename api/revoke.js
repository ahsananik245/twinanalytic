/* ==========================================================================
   TwinAnalytic — cancel an issued EtabsX licence
   --------------------------------------------------------------------------
   Marks a record revoked in the private ledger, then republishes the public
   fingerprint list the app reads.

   WHAT THIS CAN AND CANNOT DO
   A key already sent cannot be recalled — the customer has the file. What
   this does is publish a fingerprint that a running copy will notice and
   refuse. It therefore needs the customer's machine to reach the internet
   at some point, and a copy that never does keeps working.

   That gap is deliberate, and it is the right way round. The check FAILS
   OPEN: an unreachable list means "no revocations known", not "refuse to
   start". Revoking is rare; falsely locking out an engineer on a site
   machine with no connection is not, and it costs far more than the one
   uncancelled key it would prevent.

   Reversible. Revoking sets a timestamp and unrevoking clears it; the
   published list is rebuilt from the ledger either way, so a mistake here
   is undone by clicking the other button.
   ========================================================================== */

const crypto = require('crypto');
const store = require('./_licence-store');

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
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

  const key = String(body.key || '').trim();
  if (!key) {
    return res.status(400).json({ error: 'No licence key given.' });
  }
  const undo = body.undo === true;
  const reason = String(body.reason || '').replace(/[\x00-\x1f\x7f]/g, '')
                   .slice(0, 120);

  const cfg = store.config();
  if (!cfg.token) {
    return res.status(400).json({
      error: 'GITHUB_TOKEN is not set, so there is no ledger to revoke ' +
             'against and no way to publish the revocation list.'
    });
  }

  let data;
  try {
    data = await store.read(cfg);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }

  let hit = null;
  const records = data.records.map(function (r) {
    if (r.key !== key) return r;
    hit = r;
    const next = Object.assign({}, r);
    if (undo) {
      delete next.revoked_at;
      delete next.revoked_reason;
    } else {
      next.revoked_at = new Date().toISOString();
      if (reason) next.revoked_reason = reason;
    }
    return next;
  });

  if (!hit) {
    return res.status(404).json({
      error: 'That key is not in the ledger. Only keys issued through this ' +
             'panel are recorded — one signed with licence_tool.py on your ' +
             'own machine will not be here.'
    });
  }

  try {
    await store.writeAll(records,
      (undo ? 'Licence restored: ' : 'Licence revoked: ') + hit.machine, cfg);
  } catch (e) {
    return res.status(502).json({ error: 'Ledger not updated: ' + e.message });
  }

  /* Published SECOND and separately. If this fails the ledger is already
     correct, so retrying the same action puts it right; doing it the other
     way round could publish a revocation the ledger has no record of. */
  let published;
  try {
    published = await store.publishRevoked(records);
  } catch (e) {
    return res.status(502).json({
      error: 'The ledger was updated, but the public list was not ' +
             'republished: ' + e.message + ' — press revoke again.'
    });
  }

  return res.status(200).json({
    ok: true,
    undone: undo,
    machine: hit.machine,
    published: published && published.count,
    note: undo
      ? 'Restored. The key works again once the customer\'s copy refreshes ' +
        'the list.'
      : 'Revoked. A running copy stops when it next fetches the list; one ' +
        'that never reaches the internet keeps working.'
  });
};
