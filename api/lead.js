/* ==========================================================================
   TwinAnalytic — receive a contact enquiry or a calculator lead
   --------------------------------------------------------------------------
   The contact form and the calculator gate both posted to the Google Apps
   Script endpoint with mode:'no-cors'. That endpoint answers GET with 200
   and POST with 405 — it has no doPost — so every enquiry the site has
   collected was discarded, and no-cors meant the browser could not see it
   happening. Visitors saw "Proposal Received" and nothing arrived.

   This stores them the way licence requests are stored: appended to a JSON
   file in the private repository, with the same token, on a path already
   proven to work. Same-origin, so the browser can read the result and the
   page can stop claiming success it has not got.

   The Apps Script post is left in place in the front end as a best-effort
   mirror. If it is ever fixed, leads land in the sheet as well; while it is
   broken, nothing depends on it.
   ========================================================================== */

const store = require('./_licence-store');
const { notify } = require('./_notify');

const MAX_PER_DAY = 200;
const KINDS = ['contact', 'calculator', 'other'];

function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, max);
}

function leadCfg() {
  return Object.assign({}, store.config(), {
    path: process.env.LEAD_LOG_PATH || 'leads.json'
  });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  if (clean(body.website, 40)) {
    return res.status(200).json({ ok: true, stored: false });   // honeypot
  }

  const email = clean(body.email, 120);
  const name = clean(body.name, 80);
  if (!name && !email) {
    return res.status(400).json({ error: 'A name or an email is needed.' });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'That email address is not readable.' });
  }

  const kind = KINDS.includes(clean(body.kind, 20)) ? clean(body.kind, 20)
                                                    : 'other';
  const record = {
    received_at: new Date().toISOString(),
    kind,
    name,
    email,
    phone: clean(body.phone, 40),
    subject: clean(body.subject, 160),
    location: clean(body.location, 120),
    message: clean(body.message, 2000),
    status: 'new'
  };

  const cfg = leadCfg();
  if (!cfg.token) {
    return res.status(503).json({
      error: 'The enquiry inbox is not configured on the server.',
      stored: false
    });
  }

  let data;
  try {
    data = await store.read(cfg);
  } catch (e) {
    return res.status(502).json({ error: e.message, stored: false });
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = data.records.filter(
    r => String(r.received_at || '').slice(0, 10) === today).length;
  if (todayCount >= MAX_PER_DAY) {
    return res.status(429).json({ error: 'Too many enquiries today.',
                                  stored: false });
  }

  try {
    await store.append(record, cfg,
      `${kind === 'calculator' ? 'Calculator lead' : 'Enquiry'}: ` +
      `${name || email}`);
  } catch (e) {
    return res.status(502).json({ error: e.message, stored: false });
  }

  /* Calculator leads arrive in volume and are low-signal one at a time; a
     contact enquiry is someone typing a message to you. Only the second is
     worth interrupting a day for. */
  let notified = [];
  if (kind !== 'calculator') {
    const n = await notify(
      `TwinAnalytic enquiry - ${name || email}`,
      [
        `Name      ${name || '-'}`,
        `Email     ${email || '-'}`,
        record.phone ? `Phone     ${record.phone}` : '',
        record.location ? `Location  ${record.location}` : '',
        record.subject ? `Subject   ${record.subject}` : '',
        record.message ? `\n${record.message}` : ''
      ].filter(Boolean).join('\n'));
    notified = n.sent;
  }

  return res.status(200).json({ ok: true, stored: true, notified });
};
