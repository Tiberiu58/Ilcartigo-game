/*
 * ILCARTIGO website — minimal shared JS.
 *
 * One concern: the cookie consent banner. Once the player clicks accept (or
 * dismiss), we persist the decision in localStorage so the banner doesn't
 * keep nagging on every page navigation.
 *
 * No analytics or telemetry runs from this file. AdSense scripts (when
 * approved) will be inserted into individual pages with their own consent
 * gating, NOT here.
 */

(function () {
  'use strict';
  var KEY = 'ilcartigo.cookieConsent';
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (_) { /* storage blocked */ }
  if (stored === 'accepted' || stored === 'dismissed') return;

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('cookie-banner');
    if (!banner) return;
    banner.classList.remove('hidden');

    function close(decision) {
      try { localStorage.setItem(KEY, decision); } catch (_) {}
      banner.classList.add('hidden');
    }

    var acceptBtn = banner.querySelector('[data-action="accept"]');
    var dismissBtn = banner.querySelector('[data-action="dismiss"]');
    if (acceptBtn) acceptBtn.addEventListener('click', function () { close('accepted'); });
    if (dismissBtn) dismissBtn.addEventListener('click', function () { close('dismissed'); });
  });
})();
