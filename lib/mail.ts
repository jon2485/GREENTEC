// Transactional e-mail. Configure in Railway (never in code):
//   MAIL_FROM            e.g. "גרינטק <no-reply@greentec.co.il>"
//   MAIL_PROVIDER        zeptomail | resend | brevo | sendgrid   (HTTP APIs – Railway blocks outbound SMTP below the Pro plan)
//   MAIL_API_KEY for zeptomail = the Send Mail Token (with or without the "Zoho-enczapikey " prefix)
//   MAIL_API_KEY         the provider's API key
// Without these, sendMail() returns false and nothing is sent (the caller still answers the user generically).
export const mailReady = () => Boolean(process.env.MAIL_PROVIDER && process.env.MAIL_API_KEY && process.env.MAIL_FROM);

function splitFrom(from: string) { const m = from.match(/^(.*)<([^>]+)>\s*$/); return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() } : { name: '', email: from.trim() }; }

export async function sendMail(to: string, subject: string, html: string, text = '') {
  if (!mailReady()) { console.warn('[mail] not configured – message not sent'); return false; }
  const provider = String(process.env.MAIL_PROVIDER).toLowerCase(); const key = process.env.MAIL_API_KEY!; const from = process.env.MAIL_FROM!;
  let res: Response;
  if (provider === 'resend') res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, html, text: text || undefined }) });
  else if (provider === 'zeptomail') { const f = splitFrom(from); res = await fetch('https://api.zeptomail.com/v1.1/email', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { Authorization: /^zoho-enczapikey /i.test(key) ? key : `Zoho-enczapikey ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ from: { address: f.email, name: f.name || 'גרינטק' }, to: [{ email_address: { address: to } }], subject, htmlbody: html, ...(text ? { textbody: text } : {}) }) }); }
  else if (provider === 'brevo') { const f = splitFrom(from); res = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: f.name || 'גרינטק', email: f.email }, to: [{ email: to }], subject, htmlContent: html, textContent: text || undefined }) }); }
  else if (provider === 'sendgrid') { const f = splitFrom(from); res = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: f.email, name: f.name || undefined }, subject, content: [...(text ? [{ type: 'text/plain', value: text }] : []), { type: 'text/html', value: html }] }) }); }
  else { console.warn('[mail] unknown MAIL_PROVIDER'); return false; }
  if (!res.ok) { console.warn('[mail] provider answered', res.status); return false; }
  return true;
}
