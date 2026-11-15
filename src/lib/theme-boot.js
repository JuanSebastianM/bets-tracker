// Applies the saved theme before first paint (classic script, loaded right after the stylesheets so
// the CSP needs no inline script). Reads what src/data/settings.js wrote (localStorage 'bt.settings').
(function () {
  var theme = 'auto';
  try {
    var s = JSON.parse(localStorage.getItem('bt.settings') || 'null');
    if (s && (s.theme === 'light' || s.theme === 'dark' || s.theme === 'auto')) theme = s.theme;
  } catch (e) {
    theme = 'auto';
  }
  var dark = theme === 'dark' || (theme === 'auto' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.setAttribute('data-mode', theme);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try {
    var bg = getComputedStyle(root).getPropertyValue('--c-bg').trim();
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', bg);
  } catch (e) {
    /* cosmetic */
  }
})();
