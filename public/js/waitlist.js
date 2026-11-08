(() => {
  'use strict';

  const dialog = document.getElementById('waitlist');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const signupForm = document.getElementById('signup-form');
  const questionsForm = document.getElementById('questions-form');
  const statusLabel = dialog.querySelector('[data-flow-status]');
  const live = dialog.querySelector('[data-flow-live]');
  const shareBlock = dialog.querySelector('[data-share]');
  const views = [...dialog.querySelectorAll('[data-view]')];

  const FIELD_MESSAGES = {
    email: 'Enter a valid email address, like you@example.com.',
    firstName: 'Enter your first name.',
    consent: 'Tick the box to join the waitlist.',
  };
  const FAULT_TIPS = {
    high_hands: 'high hands at the top',
    low_hip_turn: 'not enough hip turn',
    hips_spinning: 'hips spinning out',
  };
  const NETWORK_ERROR = 'We couldn’t reach the server. Check your connection and try again.';

  let token = null;
  let firstName = '';
  let opener = null;
  let busy = false;

  // JavaScript handles validation messaging from here; native validation is the no-JS fallback.
  signupForm.noValidate = true;

  function showView(name, { announce } = {}) {
    let active;
    views.forEach((view) => {
      const on = view.dataset.view === name;
      view.hidden = !on;
      if (on) active = view;
    });
    shareBlock.hidden = name !== 'thanks' && name !== 'skipped';
    statusLabel.textContent = active.dataset.status;
    dialog.setAttribute('aria-labelledby', active.getAttribute('aria-labelledby'));
    dialog.scrollTop = 0;
    if (announce) live.textContent = announce;
    if (dialog.open) focusHeading(active);
  }

  function focusHeading(view) {
    const heading = view.querySelector('[tabindex="-1"]');
    if (heading) heading.focus({ preventScroll: true });
  }

  function currentView() {
    return views.find((view) => !view.hidden);
  }

  function openFlow(trigger) {
    opener = trigger || null;
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('is-locked');
    dialog.scrollTop = 0;
    focusHeading(currentView());
  }

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('is-locked');
    if (location.hash === '#waitlist') {
      history.replaceState(null, '', location.pathname + location.search);
    }
    if (opener) opener.focus();
  });

  document.querySelectorAll('[data-waitlist-open]').forEach((trigger) => {
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openFlow(trigger);
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === ' ') {
        event.preventDefault();
        openFlow(trigger);
      }
    });
  });

  dialog.querySelector('[data-flow-close]').addEventListener('click', () => dialog.close());

  if (location.hash === '#waitlist') openFlow(null);

  // Field-level errors
  function setFieldError(name, message) {
    const input = signupForm.elements[name];
    const error = document.getElementById(name + '-error');
    error.textContent = message || '';
    error.hidden = !message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function checkField(name) {
    const input = signupForm.elements[name];
    let valid;
    if (name === 'consent') valid = input.checked;
    else if (name === 'email') valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
    else valid = input.value.trim().length > 0;
    setFieldError(name, valid ? '' : FIELD_MESSAGES[name]);
    return valid;
  }

  ['email', 'firstName', 'consent'].forEach((name) => {
    const input = signupForm.elements[name];
    const event = name === 'consent' ? 'change' : 'input';
    input.addEventListener(event, () => {
      if (input.getAttribute('aria-invalid') === 'true') checkField(name);
    });
  });

  function setFormError(form, message) {
    const box = form.querySelector('[data-form-error]');
    box.textContent = message || '';
    box.hidden = !message;
  }

  function setBusy(form, on, busyText) {
    const button = form.querySelector('[data-submit]');
    busy = on;
    if (on) {
      button.dataset.label = button.textContent;
      button.textContent = busyText;
      button.setAttribute('aria-busy', 'true');
    } else {
      button.textContent = button.dataset.label;
      button.removeAttribute('aria-busy');
    }
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  }

  function fillFirstName(name) {
    dialog.querySelectorAll('[data-first-name]').forEach((el) => {
      el.textContent = name;
    });
  }

  // Step 1: join the waitlist
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    setFormError(signupForm, '');

    const invalid = ['email', 'firstName', 'consent'].filter((name) => !checkField(name));
    if (invalid.length) {
      signupForm.elements[invalid[0]].focus();
      return;
    }

    setBusy(signupForm, true, 'Joining…');
    try {
      const { ok, status, body } = await postJson('/api/waitlist', {
        email: signupForm.elements.email.value.trim(),
        firstName: signupForm.elements.firstName.value.trim(),
        consent: signupForm.elements.consent.checked,
        website: signupForm.elements.website.value,
      });
      if (!ok) {
        if (status === 422 && body.fields) {
          const names = Object.keys(body.fields);
          names.forEach((name) => setFieldError(name, body.fields[name]));
          signupForm.elements[names[0]].focus();
        } else {
          setFormError(signupForm, body.error || NETWORK_ERROR);
        }
        return;
      }
      token = body.token;
      firstName = signupForm.elements.firstName.value.trim();
      fillFirstName(firstName);
      showView('questionnaire', { announce: 'You’re on the list. Seven optional questions follow.' });
    } catch {
      setFormError(signupForm, NETWORK_ERROR);
    } finally {
      setBusy(signupForm, false);
    }
  });

  // Step 2: optional questionnaire
  function collectAnswers() {
    const answers = {};
    new FormData(questionsForm).forEach((value, key) => {
      const trimmed = String(value).trim();
      if (trimmed) answers[key] = trimmed;
    });
    return answers;
  }

  function finishSkipped() {
    showView('skipped', { announce: 'Questionnaire skipped. Your place is saved.' });
  }

  dialog.querySelectorAll('[data-skip]').forEach((button) => {
    button.addEventListener('click', finishSkipped);
  });

  questionsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    setFormError(questionsForm, '');

    const answers = collectAnswers();
    if (!Object.keys(answers).length) {
      finishSkipped();
      return;
    }

    setBusy(questionsForm, true, 'Sending…');
    try {
      const { ok, body } = await postJson('/api/waitlist/answers', { token, answers });
      if (!ok) {
        setFormError(questionsForm, body.error || NETWORK_ERROR);
        return;
      }
      const fault = FAULT_TIPS[answers.fault];
      dialog.querySelector('[data-tip]').textContent = fault
        ? `Watch your inbox for drill tips on ${fault} before launch.`
        : 'Watch your inbox for drill tips before launch.';
      showView('thanks', { announce: 'Answers received. Thank you.' });
    } catch {
      setFormError(questionsForm, NETWORK_ERROR);
    } finally {
      setBusy(questionsForm, false);
    }
  });

  // Share
  const shareButton = dialog.querySelector('[data-share-btn]');
  shareButton.addEventListener('click', async () => {
    const url = location.origin + '/';
    const data = {
      title: 'StripeStick',
      text: 'The alignment stick that moves with you. See it. Feel it. Stripe it.',
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        /* share sheet dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      const label = shareButton.textContent;
      shareButton.textContent = 'Link copied';
      live.textContent = 'Link copied to clipboard.';
      setTimeout(() => {
        shareButton.textContent = label;
      }, 2500);
    } catch {
      live.textContent = 'Copy this link to share: ' + url;
      shareButton.textContent = url;
    }
  });
})();
