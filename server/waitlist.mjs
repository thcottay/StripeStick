// Waitlist API logic shared by the local Node server and the Netlify function.
import { createLeadStore } from './store.mjs';
import { validateSignup, validateAnswers } from './validate.mjs';

export const MAX_BODY = 16 * 1024;

export const createStoreFromEnv = () =>
  createLeadStore({
    url: process.env.GOOGLE_SHEETS_WEBHOOK_URL,
    secret: process.env.GOOGLE_SHEETS_SECRET,
  });

const json = (status, payload) => ({ status, json: payload });
const redirect = (location) => ({ status: 303, location });

function parseBody(contentType, raw) {
  const type = String(contentType || '').split(';')[0].trim();
  if (type === 'application/json') {
    const data = JSON.parse(raw || '{}');
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new SyntaxError('not an object');
    return { data, isForm: false };
  }
  if (type === 'application/x-www-form-urlencoded') {
    return { data: Object.fromEntries(new URLSearchParams(raw)), isForm: true };
  }
  throw Object.assign(new Error('unsupported'), { status: 415 });
}

async function signup(store, { data, isForm }) {
  // Bots that fill the honeypot get a normal-looking success and nothing is stored.
  if (data.website) return isForm ? redirect('/thanks.html') : json(201, { token: 'ok' });

  const { errors, value } = validateSignup(data);
  if (errors) {
    return isForm ? redirect('/#waitlist') : json(422, { error: 'Please check the highlighted fields.', fields: errors });
  }

  const token = await store.upsertSignup(value);
  return isForm ? redirect('/thanks.html') : json(201, { token });
}

async function answers(store, { data }) {
  const { error, value } = validateAnswers(data.answers);
  if (error) return json(422, { error });
  if (typeof data.token !== 'string' || !(await store.saveAnswers(data.token, value))) {
    return json(404, { error: 'We couldn’t match these answers to your sign-up. Your place on the waitlist is still saved.' });
  }
  return json(200, { ok: true });
}

export const API_ROUTES = {
  '/api/waitlist': signup,
  '/api/waitlist/answers': answers,
};

// Returns { status, json } or { status, location } for the host to send.
export async function runRoute(pathname, store, { contentType, raw }) {
  try {
    if (Buffer.byteLength(raw) > MAX_BODY) return json(413, { error: 'That request could not be processed.' });
    return await API_ROUTES[pathname](store, parseBody(contentType, raw));
  } catch (err) {
    if (err instanceof SyntaxError) return json(400, { error: 'That request could not be read.' });
    if (err.status) return json(err.status, { error: 'That request could not be processed.' });
    console.error('Request failed:', err.message);
    return json(500, { error: 'Something went wrong on our end. Please try again.' });
  }
}
