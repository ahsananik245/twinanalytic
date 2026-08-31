/* ==========================================================================
   TwinAnalytic — instant notification
   --------------------------------------------------------------------------
   A licence request lands in a JSON file in a private repository, which is
   the right place to KEEP it and a hopeless place to WATCH. Nobody opens a
   repo hourly to see whether someone wants to buy something, and a request
   that sits unseen for two days is a sale cooling off.

   GitHub's own watch notifications do not help here: the commit is made with
   the owner's token, so it is the owner's own commit, and GitHub does not
   email you about your own pushes.

   Two channels, both free, whichever is configured:

     TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
         Instant, no domain to verify, no sender reputation to manage, and
         it rings a phone. Set up in about two minutes through @BotFather.

     RESEND_API_KEY + NOTIFY_EMAIL
         Ordinary email, for when a written record in an inbox is what is
         wanted. Needs an account and, to send from your own domain rather
         than theirs, a DNS record.

   Configure either, both, or neither. Nothing here can fail a request: the
   record is already stored by the time this runs, and a customer must never
   be told their request failed because a notification did not send.
   ========================================================================== */

const TIMEOUT_MS = 6000;

/* Notifications are a side errand. If a provider is slow, the customer
   should not wait on it — the request is already safely written. */
async function post(url, options) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, Object.assign({}, options, { signal: ctl.signal }));
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError'
      ? 'timed out' : e.message };
  } finally {
    clearTimeout(t);
  }
}

async function telegram(subject, body) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chat = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chat) return null;

  /* Plain text, not Markdown or HTML. A customer's firm name is arbitrary
     text and an unescaped underscore or asterisk in it makes Telegram
     reject the whole message with a parse error — losing the notification
     for the one request whose name happened to contain punctuation. */
  const r = await post(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      text: subject + '\n\n' + body,
      disable_web_page_preview: true
    })
  });
  return { channel: 'telegram', ok: r.ok, status: r.status, error: r.error };
}

async function email(subject, body) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const to = (process.env.NOTIFY_EMAIL || '').trim();
  if (!key || !to) return null;

  /* onboarding@resend.dev works with no DNS at all, which means this can be
     switched on in a minute and moved to the real domain later. */
  const from = (process.env.NOTIFY_FROM || 'EtabsX <onboarding@resend.dev>').trim();
  const r = await post('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, text: body })
  });
  return { channel: 'email', ok: r.ok, status: r.status, error: r.error };
}

/* Never throws. Returns what was attempted, so a caller can report "stored
   but not notified" rather than either lying or failing. */
async function notify(subject, body) {
  const results = [];
  try {
    const out = await Promise.all([
      telegram(subject, body).catch(e => ({ channel: 'telegram', ok: false, error: e.message })),
      email(subject, body).catch(e => ({ channel: 'email', ok: false, error: e.message }))
    ]);
    for (const r of out) if (r) results.push(r);
  } catch (e) {
    /* Unreachable in practice — every branch above catches — but a
       notification must not be able to take down the request. */
  }
  return {
    configured: results.length > 0,
    sent: results.filter(r => r.ok).map(r => r.channel),
    failed: results.filter(r => !r.ok)
  };
}

module.exports = { notify };
