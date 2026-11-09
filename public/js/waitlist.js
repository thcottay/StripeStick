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
  const tipLine = dialog.querySelector('[data-tip]');

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

  // Each step of the flow has its own address. The server returns the same page for all of them.
  const ROUTES = {
    '/waitlist': 'signup',
    '/waitlist/questions': 'questionnaire',
    '/waitlist/thanks': 'thanks',
    '/waitlist/skipped': 'skipped',
  };
  const PATHS = Object.fromEntries(Object.entries(ROUTES).map(([path, view]) => [view, path]));
  const HOME_TITLE = document.title;
  const SESSION_KEY = 'stripestick-waitlist';

  let session = readSession();
  let opener = null;
  let busy = false;

  // Keeps progress through a refresh. Lasts only as long as the tab, and the flow still works without it.
  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {};
    } catch {
      return {};
    }
  }

  function updateSession(changes) {
    session = { ...session, ...changes };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* storage unavailable */
    }
  }

  const routeForLocation = () => ROUTES[location.pathname.replace(/\/+$/, '')];
  const urlFor = (path) => path + location.search;

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
    document.title = active.dataset.title;
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

  // Where someone should land when they haven't asked for a step they can currently see.
  function resumeView() {
    return session.finished || (session.token ? 'questionnaire' : 'signup');
  }

  function canView(view) {
    if (view === 'signup') return true;
    if (view === 'questionnaire') return Boolean(session.token);
    return session.finished === view;
  }

  function openDialog() {
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('is-locked');
    dialog.scrollTop = 0;
    focusHeading(currentView());
  }

  // Moves forward to a step, adding it to browser history.
  function goTo(view, options) {
    history.pushState(null, '', urlFor(PATHS[view]));
    showView(view, options);
  }

  function openFlow(trigger) {
    opener = trigger;
    goTo(resumeView());
    openDialog();
  }

  // Makes the screen match the address, for direct visits and the back and forward buttons.
  function syncToLocation() {
    const requested = routeForLocation();
    if (!requested) {
      if (dialog.open) closeFlow();
      return;
    }
    const view = canView(requested) ? requested : resumeView();
    if (view !== requested) history.replaceState(null, '', urlFor(PATHS[view]));
    showView(view);
    openDialog();
  }

  // Runs right after closing, and again from the close event, which browsers can delay and which
  // is the only signal when someone presses Escape. Safe to run twice.
  function afterClose() {
    if (dialog.open) return;
    document.documentElement.classList.remove('is-locked');
    document.title = HOME_TITLE;
    if (routeForLocation()) history.pushState(null, '', urlFor('/'));
    if (opener) opener.focus();
  }

  function closeFlow() {
    dialog.close();
    afterClose();
  }

  dialog.addEventListener('close', afterClose);

  window.addEventListener('popstate', syncToLocation);

  document.querySelectorAll('[data-waitlist-open]').forEach((trigger) => {
    trigger.setAttribute('href', '/waitlist');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.addEventListener('click', (event) => {
      // Leave ctrl/cmd-click and similar to the browser, so the link can open in a new tab.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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

  dialog.querySelector('[data-flow-close]').addEventListener('click', closeFlow);

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
    if (response.status === 429 && !body.error) body.error = 'Too many attempts. Please wait a minute and try again.';
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
      const firstName = signupForm.elements.firstName.value.trim();
      updateSession({ token: body.token, firstName, finished: null, tip: null });
      fillFirstName(firstName);
      goTo('questionnaire', { announce: 'You’re on the list. Seven optional questions follow.' });
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
    updateSession({ finished: 'skipped' });
    goTo('skipped', { announce: 'Questionnaire skipped. Your place is saved.' });
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
      const { ok, body } = await postJson('/api/waitlist/answers', { token: session.token, answers });
      if (!ok) {
        setFormError(questionsForm, body.error || NETWORK_ERROR);
        return;
      }
      const fault = FAULT_TIPS[answers.fault];
      const tip = fault
        ? `Watch your inbox for drill tips on ${fault} before launch.`
        : 'Watch your inbox for drill tips before launch.';
      updateSession({ finished: 'thanks', tip });
      tipLine.textContent = tip;
      goTo('thanks', { announce: 'Answers received. Thank you.' });
    } catch {
      setFormError(questionsForm, NETWORK_ERROR);
    } finally {
      setBusy(questionsForm, false);
    }
  });

  // Restore progress and honor the address on load.
  if (session.firstName) fillFirstName(session.firstName);
  if (session.tip) tipLine.textContent = session.tip;
  if (location.hash === '#waitlist') history.replaceState(null, '', urlFor('/waitlist'));
  if (routeForLocation()) syncToLocation();

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
