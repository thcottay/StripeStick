// Microsoft Clarity: session recordings, heatmaps and waitlist funnel events.
// Paste the project ID from Clarity's Settings > Overview. It's public, so it's safe in this file.
(() => {
  'use strict';

  const CLARITY_PROJECT_ID = 'zb6mszj3mt';
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!CLARITY_PROJECT_ID || isLocal) return;

  // Holds calls made before Clarity's script arrives.
  window.clarity = function () {
    (window.clarity.q = window.clarity.q || []).push(arguments);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;
  document.head.append(script);
})();
