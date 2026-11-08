const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

const clean = (value, max) =>
  typeof value === 'string' ? value.replace(CONTROL_CHARS, ' ').trim().slice(0, max) : '';

const CHOICES = {
  fault: ['high_hands', 'low_hip_turn', 'hips_spinning', 'not_sure'],
  handicap: ['under_10', '10_20', '20_plus', 'none'],
  practice: ['range', 'home', 'course'],
  prototype: ['yes', 'no'],
  source: ['instagram', 'tiktok', 'youtube', 'friend', 'golf_pro', 'other'],
};
const FREE_TEXT = { location: 80, price: 20 };

export function validateSignup(data) {
  const email = clean(data.email, 254).toLowerCase();
  const firstName = clean(data.firstName, 80);
  const consent = data.consent === true || data.consent === 'on';

  const errors = {};
  if (!EMAIL.test(email)) errors.email = 'Enter a valid email address, like you@example.com.';
  if (!firstName) errors.firstName = 'Enter your first name.';
  if (!consent) errors.consent = 'Tick the box to join the waitlist.';

  if (Object.keys(errors).length) return { errors };
  return { value: { email, firstName } };
}

export function validateAnswers(answers) {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) {
    return { error: 'Those answers could not be read.' };
  }
  const value = {};
  for (const [key, options] of Object.entries(CHOICES)) {
    if (options.includes(answers[key])) value[key] = answers[key];
  }
  for (const [key, max] of Object.entries(FREE_TEXT)) {
    const text = clean(answers[key], max);
    if (text) value[key] = text;
  }
  return { value };
}
