// Email (Nov 19, launch Gate A, App Buildout Standard stage 6): invite links and Forgot Password links, sent through
// Resend's HTTP API (plain fetch, no package). The same setup as Mise (~/Coding/baldwin-training/server/mail.mjs).
//
// Off until all three are set on Railway:
//   RESEND_API_KEY   from resend.com → API Keys
//   MAIL_FROM        e.g. "Clinically Ready <hello@clinicallyready.com>", on a domain verified in Resend (SPF + DKIM)
//   PUBLIC_ORIGIN    the app's real address (already used by Google/Microsoft sign-in)
// While it's off, invites show a link to copy (as before) and Forgot Password says to ask an admin (as before).
//
// Links are always built from PUBLIC_ORIGIN, never from the request's Host header, so a forged Host can't get someone
// sent a reset link that points at another site.

const API = () => process.env.RESEND_API_URL || 'https://api.resend.com/emails'; // tests point this at a fake

/** Mail is on when the key, the sender and the public address are all set. `env` and `origin` are for tests. */
export function mailOn(app, env = process.env) {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM && app.publicOrigin);
}

export async function sendMail({ to, subject, text, html }, env = process.env) {
  const res = await fetch(API(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const oneLine = (s, max = 80) => String(s || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const first = (name) => oneLine(name).split(' ')[0] || 'there';

function layout({ lines, button, url, after }) {
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F6F4F0;font-family:Arial,Helvetica,sans-serif;color:#1F2F36">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border:1px solid #E2DED6;border-radius:12px">
<tr><td style="padding:32px">
${lines.map((l) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px">${esc(l)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#123A4C;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${esc(button)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#4E5B60">Or copy this link: ${esc(url)}</p>
${after.map((l) => `<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#4E5B60">${esc(l)}</p>`).join('\n')}
</td></tr></table></body></html>`;
  const text = [...lines, '', `${button}: ${url}`, '', ...after].join('\n');
  return { html, text };
}

/** The invite: who sent it, which practice, the link, and when it stops working. */
export function inviteEmail({ name, practice, inviter, url, days }) {
  const where = oneLine(practice) || 'your practice';
  const who = oneLine(inviter);
  const subject = `You’re invited to ${where}’s onboarding`;
  const { html, text } = layout({
    lines: [`Hi ${first(name)},`, `${who ? who + ' invited you' : 'You’re invited'} to set up your account for ${where}’s onboarding. It holds your lessons, your checklist and the paperwork for your first weeks.`],
    button: 'Set up my account',
    url,
    after: [`This link works once and stops working in ${days} days.`, 'Didn’t expect this? You can ignore this email.'],
  });
  return { subject, html, text };
}

/** The reset: the practice, the link, and when it stops working. */
export function resetEmail({ name, practice, url, hours }) {
  const where = oneLine(practice);
  const subject = where ? `Reset your password for ${where}` : 'Reset your password';
  const { html, text } = layout({
    lines: [`Hi ${first(name)},`, `Someone asked to reset the password for your ${where ? where + ' ' : ''}onboarding account. If it was you, choose a new one here.`],
    button: 'Choose a new password',
    url,
    after: [`This link works once and stops working in ${hours} hours. Using it signs you out everywhere else.`, 'Didn’t ask? You can ignore this email: your password stays the same.'],
  });
  return { subject, html, text };
}
