/* site made by A.t */
/* Runs before first paint so the page never flashes the wrong theme. */
(function () {
  'use strict';
  var theme = null;
  try { theme = localStorage.getItem('saraland:theme'); } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
