// Microsoft Clarity (recordings and heatmaps) and Google Analytics (traffic and conversions).
// Both IDs are public, so they're safe in this file. Leave one blank to turn that service off.
(() => {
  'use strict';

  const CLARITY_PROJECT_ID = 'zb6mszj3mt';
  const GA_MEASUREMENT_ID = 'G-6RH5Q34XVZ';
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (isLocal) return;

  function loadScript(src) {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.append(script);
  }

  if (CLARITY_PROJECT_ID) {
    // Holds calls made before Clarity's script arrives.
    window.clarity = function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    loadScript(`https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`);
  }

  if (GA_MEASUREMENT_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
  }

  // Never pass names, emails or form answers here.
  window.trackEvent = (name) => {
    window.clarity?.('event', name);
    window.gtag?.('event', name);
  };
})();
