// Waitlist storage: sends submissions to the Apps Script web app attached to the Google Sheet.
// See google-apps-script/Code.gs for the receiving end.
import { createHmac, timingSafeEqual } from 'node:crypto';

const CONSENT_TEXT = 'I agree to receive StripeStick launch news and early-access emails.';
const REQUEST_TIMEOUT_MS = 20_000;

export function createLeadStore({ url, secret }) {
  const sign = (email) => createHmac('sha256', secret).update(`answers:${email}`).digest('base64url');

  async function send(payload) {
    if (!url || !secret) throw new Error('Google Sheet is not configured.');
    // Apps Script answers with a redirect to the result, which fetch follows.
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, secret, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Google Sheet returned a non-JSON response (${response.status}). Check the web app is deployed with access for "Anyone".`);
    }
    if (!result.ok) throw new Error(`Google Sheet rejected the request: ${result.error}`);
    return result;
  }

  return {
    // Returns whether this email is new, and a signed token that authorizes the follow-up questionnaire.
    async upsertSignup({ email, firstName }) {
      const { created } = await send({ action: 'signup', email, firstName, consentText: CONSENT_TEXT });
      if (created === undefined) {
        console.warn('Apps Script did not report "created". Publish the latest Code.gs as a new version to enable confirmation emails.');
      }
      return { created: created === true, token: `${Buffer.from(email).toString('base64url')}.${sign(email)}` };
    },

    async saveAnswers(token, answers) {
      const [encoded, signature = ''] = token.split('.');
      const email = Buffer.from(encoded, 'base64url').toString('utf8');
      const expected = Buffer.from(sign(email));
      const given = Buffer.from(signature);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
      const { found } = await send({ action: 'answers', email, answers });
      return found;
    },
  };
}
