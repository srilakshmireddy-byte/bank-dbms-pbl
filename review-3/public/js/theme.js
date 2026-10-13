// Loaded synchronously in <head> so the saved theme applies before first paint (no flash).
(function () {
  var theme = null;
  try { theme = localStorage.getItem('wcb-theme'); } catch (e) { /* storage blocked */ }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
