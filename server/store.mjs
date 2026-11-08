// Waitlist storage: a single JSON file written atomically. Swap this module to use a database or CRM.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

export const CONSENT_TEXT = 'I agree to receive StripeStick launch news and early-access emails.';

export function createLeadStore(dir) {
  const file = path.join(dir, 'leads.json');
  let leads = null;
  let queue = Promise.resolve();

  async function load() {
    if (leads) return;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      leads = JSON.parse(await readFile(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      leads = [];
    }
  }

  async function persist() {
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(leads, null, 2), { mode: 0o600 });
    await rename(tmp, file);
  }

  // Every mutation runs in order so concurrent requests can't lose writes.
  function serialize(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  return {
    // Returns a one-time token that authorizes the follow-up questionnaire for this sign-up.
    upsertSignup({ email, firstName }) {
      return serialize(async () => {
        await load();
        const now = new Date().toISOString();
        const token = randomBytes(24).toString('hex');
        const existing = leads.find((lead) => lead.email === email);
        if (existing) {
          Object.assign(existing, { firstName, token, updatedAt: now });
        } else {
          leads.push({
            id: randomUUID(),
            email,
            firstName,
            consent: { text: CONSENT_TEXT, at: now },
            token,
            answers: null,
            createdAt: now,
            updatedAt: now,
          });
        }
        await persist();
        return token;
      });
    },

    saveAnswers(token, answers) {
      return serialize(async () => {
        await load();
        const lead = leads.find((entry) => entry.token === token);
        if (!lead) return false;
        const now = new Date().toISOString();
        Object.assign(lead, { answers, answersAt: now, updatedAt: now });
        await persist();
        return true;
      });
    },
  };
}
