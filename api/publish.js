/* ==========================================================================
   TwinAnalytic — Publish endpoint (Vercel serverless function)
   --------------------------------------------------------------------------
   Lets the admin panel publish without ever holding a GitHub token in the
   browser. The token lives in a Vercel environment variable and is only ever
   read here, on the server.

   This also turns the admin passcode into real authentication: previously it
   was a client-side lock anyone could read past in the page source. Now the
   server checks it before it will write anything.

   Required environment variables (Vercel → Project → Settings → Environment
   Variables):

     GITHUB_TOKEN          Fine-grained PAT, Contents: Read and write,
                           scoped to this repository only.
     ADMIN_PASSCODE_HASH   SHA-256 hex of your admin passcode. The panel's
                           Settings page will compute this for you.

   Optional, with sensible defaults:

     GITHUB_OWNER          default: ahsananik245
     GITHUB_REPO           default: twinanalytic
     GITHUB_BRANCH         default: main
     CONTENT_PATH          default: data/content.json
   ========================================================================== */

const crypto = require('crypto');

const GITHUB_API = 'https://api.github.com';

// Reject absurd payloads before doing any work. The real content file is
// ~25 KB; a megabyte is already far past anything legitimate.
const MAX_BYTES = 1024 * 1024;

function config() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    passHash: (process.env.ADMIN_PASSCODE_HASH || '').trim().toLowerCase(),
    owner: process.env.GITHUB_OWNER || 'ahsananik245',
    repo: process.env.GITHUB_REPO || 'twinanalytic',
    branch: process.env.GITHUB_BRANCH || 'main',
    path: process.env.CONTENT_PATH || 'data/content.json'
  };
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

// Compares in constant time so response latency cannot be used to guess the
// passcode character by character.
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// A deliberate pause on every rejection. It costs a legitimate user nothing
// and makes online guessing impractically slow.
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubRequest(url, token, options) {
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

module.exports = async (req, res) => {
  const cfg = config();

  // This endpoint is only ever called by the panel on the same origin, so it
  // deliberately sends no permissive CORS headers.
  res.setHeader('Cache-Control', 'no-store');

  // ---- status probe -------------------------------------------------------
  // The panel calls this on load to decide whether to offer one-click publish.
  // It reveals only whether the server is configured, never any secret.
  if (req.method === 'GET') {
    return res.status(200).json({
      configured: Boolean(cfg.token && cfg.passHash),
      hasToken: Boolean(cfg.token),
      hasPasscode: Boolean(cfg.passHash),
      repo: `${cfg.owner}/${cfg.repo}`,
      branch: cfg.branch,
      path: cfg.path
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use POST to publish.' });
  }

  if (!cfg.token || !cfg.passHash) {
    return res.status(503).json({
      error: 'Publishing is not configured on the server. Set GITHUB_TOKEN and ' +
             'ADMIN_PASSCODE_HASH in your Vercel project settings, then redeploy.'
    });
  }

  // ---- parse body ---------------------------------------------------------
  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) {
      return res.status(400).json({ error: 'Request body is not valid JSON.' });
    }
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Request body is missing.' });
  }

  // ---- authenticate -------------------------------------------------------
  const supplied = payload.passcode;
  if (!supplied) {
    await delay(400);
    return res.status(401).json({ error: 'Passcode required.' });
  }
  if (!timingSafeEqual(sha256Hex(supplied), cfg.passHash)) {
    await delay(1000);
    return res.status(401).json({
      error: 'That passcode was rejected by the server. If you changed it in the ' +
             'panel, update ADMIN_PASSCODE_HASH in Vercel to match.'
    });
  }

  // ---- validate the content ----------------------------------------------
  const content = payload.content;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'No content supplied.' });
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
    return res.status(413).json({ error: 'Content is too large to publish.' });
  }

  // Never commit something that would break every page on the site.
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return res.status(400).json({ error: 'Content is not valid JSON, so it was not published.' });
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.site || !parsed.theme) {
    return res.status(400).json({
      error: 'Content does not look like a TwinAnalytic content file, so it was not published.'
    });
  }

  const message = String(payload.message || 'content: update site content').slice(0, 500);
  const contentsUrl =
    `${GITHUB_API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}` +
    `/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;

  try {
    // The current blob SHA is required to replace an existing file.
    const current = await githubRequest(
      `${contentsUrl}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token, { method: 'GET' });

    if (!current.ok && current.status !== 404) {
      if (current.status === 401) {
        return res.status(502).json({
          error: 'GitHub rejected the server token. It may have expired — update ' +
                 'GITHUB_TOKEN in Vercel and redeploy.'
        });
      }
      if (current.status === 403) {
        return res.status(502).json({
          error: 'GitHub refused the request. The server token likely lacks ' +
                 'Contents: Read and write on this repository.'
        });
      }
      return res.status(502).json({
        error: `GitHub responded ${current.status} when reading the current file.`
      });
    }

    const put = await githubRequest(contentsUrl, cfg.token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: cfg.branch,
        sha: current.status === 404 ? undefined : current.body.sha
      })
    });

    if (!put.ok) {
      if (put.status === 409) {
        return res.status(409).json({
          error: 'The file changed on GitHub since this page loaded. Reload the panel and publish again.'
        });
      }
      return res.status(502).json({
        error: (put.body && put.body.message) || `GitHub responded ${put.status}.`
      });
    }

    return res.status(200).json({
      ok: true,
      commit: put.body.commit ? put.body.commit.sha : null,
      url: put.body.commit ? put.body.commit.html_url : null,
      repo: `${cfg.owner}/${cfg.repo}`,
      branch: cfg.branch
    });
  } catch (err) {
    return res.status(502).json({ error: `Could not reach GitHub: ${err.message}` });
  }
};
