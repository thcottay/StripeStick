// Waitlist confirmation email, sent through Resend. A failed send never fails the sign-up.
const RESEND_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 8_000;

// Up to two words of letters, with no digits, dots or symbols. Anyone can type any address and
// name into the form, so this stops the field being used to send links or ads from our domain.
const SAFE_NAME = /^\p{L}[\p{L}\p{M}'’-]*(?: \p{L}[\p{L}\p{M}'’-]*)?$/u;
const MAX_NAME_LENGTH = 30;

const escapeHtml = (text) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function greeting(firstName) {
  return firstName.length <= MAX_NAME_LENGTH && SAFE_NAME.test(firstName) ? `Thanks, ${firstName}.` : 'Thanks for joining.';
}

export function buildConfirmationEmail(firstName) {
  const opening = greeting(firstName);
  const message = 'We’ll email you when StripeStick launches, and waitlist members get first access.';
  const reason =
    'You’re receiving this because this address was used to join the StripeStick waitlist. If that wasn’t you, you can ignore this email.';
  const tagline = 'See it. Feel it. Stripe it.';

  return {
    subject: 'You’re on the StripeStick waitlist',
    text: `You’re on the list.\n\n${opening} ${message}\n\n${tagline}\n\n${reason}\n`,
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e5;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;font-family:Arial,Helvetica,sans-serif;color:#2a2f2b;">
    <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:#244a45;">You’re on the list.</h1>
    <p style="margin:0 0 24px;font-size:17px;line-height:1.5;">${escapeHtml(opening)} ${message}</p>
    <p style="margin:0 0 32px;font-size:15px;font-weight:bold;color:#244a45;">${tagline}</p>
    <p style="margin:0;padding-top:16px;border-top:1px solid #d9ded5;font-size:13px;line-height:1.5;color:#5e6a63;">${reason}</p>
  </div>
</body>
</html>`,
  };
}

export function createMailer({ apiKey, from, replyTo }) {
  return {
    async sendConfirmation({ email, firstName }) {
      if (!apiKey || !from) {
        console.warn('Confirmation email skipped: RESEND_API_KEY and EMAIL_FROM are not set.');
        return;
      }
      try {
        const response = await fetch(RESEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'stripestick-waitlist/1.0',
          },
          body: JSON.stringify({
            from,
            to: [email],
            ...(replyTo ? { reply_to: replyTo } : {}),
            ...buildConfirmationEmail(firstName),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          console.error(`Confirmation email failed (${response.status}): ${detail.slice(0, 300)}`);
        }
      } catch (err) {
        console.error('Confirmation email failed:', err.message);
      }
    },
  };
}
