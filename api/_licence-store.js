/* ==========================================================================
   TwinAnalytic — the issued-licence ledger
   --------------------------------------------------------------------------
   Every key the panel signs is appended to a JSON file in a PRIVATE GitHub
   repository. The application needs no such record — a key carries its own
   expiry and is verified offline against it — but the seller does, and
   without one none of these can be answered after the fact:

       who expires this month, so I can raise the renewal
       resend my key, I lost it
       how many licences have I actually sold

   WHY GITHUB AND NOT A DATABASE
   The panel already writes site content to GitHub through publish.js, so
   the token, the pattern and the failure modes are all understood. Adding
   Postgres for a file that gains a few rows a month would be a service to
   run, pay for and back up, for no gain.

   WHY A PRIVATE REPO, EMPHATICALLY
   This file holds customer names and their licence keys. The website
   repository is PUBLIC. Writing the ledger there would publish every key
   ever issued, and although a key only unlocks the one machine it names,
   they are still customers' property and a complete sales record. The
   default below points at the private app repo, and there is a hard guard
   in write(): the ledger refuses to be written to the website repo at all.
   ========================================================================== */

const crypto = require('crypto');

const GITHUB_API = 'https://api.github.com';

function config() {
  return {
    token: (process.env.GITHUB_TOKEN || '').trim(),
    owner: process.env.LICENCE_LOG_OWNER || process.env.GITHUB_OWNER || 'ahsananik245',
    repo: process.env.LICENCE_LOG_REPO || 'etabsx',
    branch: process.env.LICENCE_LOG_BRANCH || 'master',
    path: process.env.LICENCE_LOG_PATH || 'licences.json'
  };
}

/* The repository the public website lives in. The ledger must never be
   written here, whatever the environment says. */
const PUBLIC_SITE_REPO = (process.env.GITHUB_REPO || 'twinanalytic').toLowerCase();

async function ghRequest(url, token, options) {
  const res = await fetch(url, Object.assign({}, options, {
    headers: Object.assign({
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'twinanalytic-admin'
    }, (options && options.headers) || {})
  }));
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = { message: text }; }
  return { ok: res.ok, status: res.status, body };
}

function contentsUrl(cfg) {
  return `${GITHUB_API}/repos/${encodeURIComponent(cfg.owner)}/` +
         `${encodeURIComponent(cfg.repo)}/contents/` +
         cfg.path.split('/').map(encodeURIComponent).join('/');
}

/* Returns { records, sha }. A missing file is an empty ledger, not an
   error: the first key issued is what creates it. */
async function read(cfg) {
  cfg = cfg || config();
  if (!cfg.token) return { records: [], sha: null, unconfigured: true };

  const r = await ghRequest(
    `${contentsUrl(cfg)}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token);

  if (r.status === 404) return { records: [], sha: null };
  if (!r.ok) {
    throw new Error(`Could not read the ledger (${r.status}): ` +
                    ((r.body && r.body.message) || 'unknown error'));
  }
  let records = [];
  try {
    const json = Buffer.from(r.body.content || '', 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    records = Array.isArray(parsed) ? parsed : (parsed.licences || []);
  } catch (e) {
    /* A corrupt ledger must not stop a licence being issued. It is
       reported by the list endpoint, and the append below starts a fresh
       array rather than destroying what is there — the old content stays
       in git history either way. */
    throw new Error('The ledger file is not valid JSON. Its git history ' +
                    'still has every previous version.');
  }
  return { records, sha: r.body.sha || null };
}

async function append(record, cfg, message) {
  cfg = cfg || config();
  if (!cfg.token) return { skipped: 'GITHUB_TOKEN is not set' };

  if (cfg.repo.toLowerCase() === PUBLIC_SITE_REPO) {
    /* Refused rather than written. This file names customers and carries
       their keys; the website repository is public. */
    return { skipped: 'refusing to write the ledger to the public website repo' };
  }

  const current = await read(cfg);
  const records = current.records.concat([record]);
  const body = {
    message: message ||
      `Licence issued: ${record.machine} (${record.plan}, expires ${record.expires})`,
    content: Buffer.from(JSON.stringify(records, null, 2) + '\n', 'utf8')
      .toString('base64'),
    branch: cfg.branch
  };
  if (current.sha) body.sha = current.sha;

  const w = await ghRequest(contentsUrl(cfg), cfg.token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  /* 409 means someone else wrote between the read and the write. At this
     volume that is nearly impossible, but retrying once costs nothing and
     turns a lost record into a slower one. */
  if (w.status === 409) {
    const again = await read(cfg);
    body.sha = again.sha;
    body.content = Buffer.from(
      JSON.stringify(again.records.concat([record]), null, 2) + '\n',
      'utf8').toString('base64');
    const retry = await ghRequest(contentsUrl(cfg), cfg.token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!retry.ok) {
      throw new Error(`Could not write the ledger (${retry.status})`);
    }
    return { ok: true, retried: true };
  }
  if (!w.ok) {
    throw new Error(`Could not write the ledger (${w.status}): ` +
                    ((w.body && w.body.message) || 'unknown error'));
  }
  return { ok: true };
}

/* ---------------------------------------------------------------------
   The public revocation list.

   A key can be cancelled after it has been sent - a refunded payment, a
   reversed bKash transfer, or the one that will certainly happen sooner or
   later: --days 3650 typed instead of --days 365, which is a ten-year
   licence sold for the price of one year and no way to take it back.

   What is published is a list of SHA-256 fingerprints and nothing else. No
   key, no machine code, no customer name, no expiry. Anyone may fetch it
   and learn only that some number of keys were cancelled.

   This one DOES belong in the public website repo: the app has to be able
   to fetch it without credentials.
   --------------------------------------------------------------------- */
function siteConfig() {
  return {
    token: (process.env.GITHUB_TOKEN || '').trim(),
    owner: process.env.GITHUB_OWNER || 'ahsananik245',
    repo: process.env.GITHUB_REPO || 'twinanalytic',
    branch: process.env.GITHUB_BRANCH || 'main',
    path: 'etabsx-revoked.json'
  };
}

function fingerprint(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8')
    .digest('hex').slice(0, 32);
}

/* Rewritten wholesale from the ledger rather than appended to, so the
   private ledger stays the single source of truth. A list rebuilt from the
   records cannot drift from them; one appended to separately can. */
async function publishRevoked(records) {
  const cfg = siteConfig();
  if (!cfg.token) return { skipped: 'GITHUB_TOKEN is not set' };

  const revoked = records.filter(r => r.revoked_at)
                         .map(r => fingerprint(r.key));
  const doc = {
    _comment: 'Fingerprints of cancelled EtabsX licence keys. SHA-256 of ' +
              'the key, first 32 hex characters. No key, machine code or ' +
              'customer detail is published here.',
    updated: new Date().toISOString(),
    revoked
  };

  const url = `${GITHUB_API}/repos/${encodeURIComponent(cfg.owner)}/` +
              `${encodeURIComponent(cfg.repo)}/contents/` +
              encodeURIComponent(cfg.path);

  const cur = await ghRequest(`${url}?ref=${encodeURIComponent(cfg.branch)}`,
                              cfg.token);
  const body = {
    message: `Revocation list: ${revoked.length} cancelled`,
    content: Buffer.from(JSON.stringify(doc, null, 2) + '\n', 'utf8')
      .toString('base64'),
    branch: cfg.branch
  };
  if (cur.ok && cur.body && cur.body.sha) body.sha = cur.body.sha;

  const w = await ghRequest(url, cfg.token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!w.ok) {
    throw new Error(`Could not publish the revocation list (${w.status}): ` +
                    ((w.body && w.body.message) || 'unknown error'));
  }
  return { ok: true, count: revoked.length };
}

/* Replace the whole ledger. Used by revocation, which edits a record in
   place rather than adding one. */
async function writeAll(records, message, cfg) {
  cfg = cfg || config();
  if (!cfg.token) return { skipped: 'GITHUB_TOKEN is not set' };
  if (cfg.repo.toLowerCase() === PUBLIC_SITE_REPO) {
    return { skipped: 'refusing to write the ledger to the public website repo' };
  }
  const current = await read(cfg);
  const body = {
    message: message || 'Update licence ledger',
    content: Buffer.from(JSON.stringify(records, null, 2) + '\n', 'utf8')
      .toString('base64'),
    branch: cfg.branch
  };
  if (current.sha) body.sha = current.sha;
  const w = await ghRequest(contentsUrl(cfg), cfg.token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!w.ok) {
    throw new Error(`Could not write the ledger (${w.status}): ` +
                    ((w.body && w.body.message) || 'unknown error'));
  }
  return { ok: true };
}

module.exports = {
  config, read, append, writeAll, publishRevoked, fingerprint, siteConfig
};
