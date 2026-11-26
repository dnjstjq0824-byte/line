// Worker module: mail/SMS send drivers (P2 monolith split). Pure transports;
// outbox-owning deliver/send stay in cf_worker.js (per-isolate outboxes).

// F2: mail/SMS driver adapter. mock/log are test doubles; P0-1 adds the
// real senders (resend mail, twilio SMS). Without their keys the driver
// resolves to none and every route fails closed exactly as before.
// In workerd the "file" is the worker log (dashboard/tail); tests observe
// deliveries through the outbox seams (mock/log) or a stubbed fetch.
function resolveMailDriver(env) {
  const provider = env.RECOVERY_MAIL_PROVIDER;
  if (provider === 'mock' || provider === 'log') return provider;
  if (provider === 'resend' && env.RESEND_API_KEY) return 'resend';
  return 'none';
}
function resolveSmsDriver(env) {
  const provider = env.SMS_PROVIDER;
  if (provider === 'mock' || provider === 'log') return provider;
  if (provider === 'twilio' && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM) return 'twilio';
  return 'none';
}
// P0-1: Resend mail send. Throws on transport/API failure (callers fail
// closed); returns the provider id. Needs the RESEND_API_KEY secret and
// a verified MAIL_FROM domain (SPF/DKIM/DMARC) — representative action.
async function resendSend(env, entry) {
  const from = env.MAIL_FROM || 'LUNO <noreply@lunotalk.com>';
  const recovery = entry.purpose === 'recovery';
  const subject = recovery ? '[LUNO] 비밀번호 재설정 안내' : '[LUNO] 이메일 인증번호';
  const text = recovery
    ? `LUNO 비밀번호 재설정 요청이 접수되었습니다.\n\n아래 코드를 15분 안에 입력해 주세요:\n${entry.code}\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요.`
    : `LUNO 이메일 인증번호입니다. 15분 안에 입력해 주세요:\n${entry.code}`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [entry.email], subject, text }),
  });
  if (!res.ok) throw new Error(`resend send failed: ${res.status}`);
  const sent = await res.json().catch(() => ({}));
  return sent && sent.id ? String(sent.id) : '';
}
// P0-1: Twilio SMS send. Throws on transport/API failure. Needs the
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM secrets.
async function twilioSend(env, entry) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const body = new URLSearchParams({ To: entry.phone, From: env.TWILIO_FROM, Body: `[LUNO] 인증번호: ${entry.code} (3분 유효)` });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${sid}:${env.TWILIO_AUTH_TOKEN}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`twilio send failed: ${res.status}`);
  const sent = await res.json().catch(() => ({}));
  return sent && sent.sid ? String(sent.sid) : '';
}

export { resolveMailDriver, resolveSmsDriver, resendSend, twilioSend };
