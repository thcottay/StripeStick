const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

const clean = (value, max) =>
  typeof value === 'string' ? value.replace(CONTROL_CHARS, ' ').trim().slice(0, max) : '';

// Form values mapped to the wording stored in the sheet.
const CHOICES = {
  fault: {
    high_hands: 'High hands at the top',
    low_hip_turn: 'Not enough hip turn',
    hips_spinning: 'Hips spinning out',
    not_sure: 'Not sure',
  },
  handicap: { under_10: 'Under 10', '10_20': '10–20', '20_plus': '20+', none: 'Doesn’t keep one' },
  practice: { range: 'Driving range', home: 'Home net or simulator', course: 'On the course' },
  prototype: { yes: 'Yes', no: 'Not right now' },
  source: {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    friend: 'Friend',
    golf_pro: 'Golf pro',
    other: 'Other',
  },
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
  for (const [key, labels] of Object.entries(CHOICES)) {
    const picked = answers[key];
    if (typeof picked === 'string' && Object.hasOwn(labels, picked)) value[key] = labels[picked];
  }
  for (const [key, max] of Object.entries(FREE_TEXT)) {
    const text = clean(answers[key], max);
    if (text) value[key] = text;
  }
  return { value };
}
