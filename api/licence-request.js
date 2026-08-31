/* ==========================================================================
   TwinAnalytic — receive an EtabsX licence request
   --------------------------------------------------------------------------
   The form used to post to the Google Apps Script endpoint with mode:
   'no-cors'. That endpoint answers GET with 200 and POST with 405 — it has
   no doPost — so every submission was discarded, and no-cors meant the
   browser could not see the rejection. The customer read "Request received"
   and nothing arrived.

   This writes to the same private repository the licence ledger uses, with
   the same token, which is a path already proven to work. Being same-origin
   it needs no no-cors, so the browser CAN read the response and the form can
   tell the truth about whether the request was stored.

   PUBLIC ENDPOINT
   Unlike the other licence endpoints this one has no passcode — a customer
   has to be able to reach it. It is therefore written to be dull to abuse:

     * every field is length-capped and stripped of control characters
     * the machine code must match the exact expected shape
     * a hidden honeypot field must stay empty
     * a daily cap is enforced by counting today's records, so a script
       cannot fill the repository overnight

   None of that stops a determined flood. What it does is keep the cost of
   the endpoint bounded and the file readable, and every write is a git
   commit, so anything odd is visible in history rather than silent.
   ========================================================================== */

const store = require('./_licence-store');
const { notify } = require('./_notify');

const MACHINE_RE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
const PLANS = ['project', 'quarterly', 'annual', 'perpetual', 'academic',
               'unsure'];
const PAY = ['bkash', 'nagad', 'bank', 'unsure'];
const MAX_PER_DAY = 40;

function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, max);
}

function requestCfg() {
  const c = store.config();
  return Object.assign({}, c, {
    path: process.env.LICENCE_REQ_PATH || 'licence-requests.json'
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

  /* Honeypot. A real person never sees this field, so anything in it is a
     bot. Answered with 200 rather than an error: telling a scraper it was
     detected only teaches it to try again differently. */
  if (clean(body.website, 40)) {
    return res.status(200).json({ ok: true, stored: false });
  }

  const machine = clean(body.machine, 19).toUpperCase();
  if (!MACHINE_RE.test(machine)) {
    return res.status(400).json({
      error: 'That machine code is not readable. Open EtabsX and copy the ' +
             'code it shows — sixteen characters in four groups.'
    });
  }

  const email = clean(body.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'That email address is not readable.' });
  }

  const name = clean(body.name, 80);
  if (!name) return res.status(400).json({ error: 'A name is needed.' });

  const plan = PLANS.includes(clean(body.plan, 20)) ? clean(body.plan, 20)
                                                    : 'unsure';
  const pay = PAY.includes(clean(body.pay, 20)) ? clean(body.pay, 20)
                                                : 'unsure';

  const record = {
    received_at: new Date().toISOString(),
    machine,
    plan,
    pay,
    name,
    firm: clean(body.firm, 120),
    email,
    phone: clean(body.phone, 40),
    note: clean(body.note, 600),
    status: 'new'
  };

  const cfg = requestCfg();
  if (!cfg.token) {
    /* Told plainly, so the form can push the customer at WhatsApp or email
       instead of claiming a request was filed that was not. */
    return res.status(503).json({
      error: 'The request inbox is not configured on the server.',
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
    return res.status(429).json({
      error: 'Too many requests have been filed today. Please send it on ' +
             'WhatsApp or by email instead.',
      stored: false
    });
  }

  try {
    await store.append(record, cfg,
      `Licence request: ${machine} (${plan}, ${pay}) from ${name}`);
  } catch (e) {
    return res.status(502).json({ error: e.message, stored: false });
  }

  /* Tell someone, now. The record is already written, so this cannot fail
     the request - a customer must never be told their request failed
     because a notification did not send. What it CAN do is report that it
     was not sent, which is how a silent misconfiguration gets noticed
     instead of quietly costing sales. */
  const PAY_LABEL = { bkash: 'bKash', nagad: 'Nagad', bank: 'Bank transfer',
                      unsure: 'not decided' };
  const note = await notify(
    `EtabsX licence request - ${record.name}`,
    [
      `Machine   ${record.machine}`,
      `Plan      ${record.plan}`,
      `Pay by    ${PAY_LABEL[record.pay] || record.pay}`,
      `Name      ${record.name}`,
      record.firm ? `Firm      ${record.firm}` : '',
      `Email     ${record.email}`,
      record.phone ? `Phone     ${record.phone}` : '',
      record.note ? `\nNote: ${record.note}` : '',
      '',
      'Issue the key at https://twinanalytic.com/admin -> Licences'
    ].filter(Boolean).join('\n'));

  return res.status(200).json({ ok: true, stored: true, machine,
                                notified: note.sent });
};
