(function () {
  let deferredPrompt = null;
  const scriptUrl = document.currentScript.src;
  const appRoot = new URL('../', scriptUrl);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const appleIcon = document.createElement('link');
  appleIcon.rel = 'apple-touch-icon';
  appleIcon.href = new URL('shared/rollcall-icon.svg', appRoot).href;
  document.head.appendChild(appleIcon);
  [
    ['apple-mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-title', 'RollCall'],
    ['apple-mobile-web-app-status-bar-style', 'default']
  ].forEach(([name, content]) => {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    document.head.appendChild(meta);
  });

  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 720px) {
      input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]),
      select,
      textarea { font-size: 16px !important; }
    }
    .pwa-install-banner{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;background:var(--sp-bg-card,var(--gray-50,#fff));border:1px solid var(--sp-border,var(--gray-200,#e2e8f0));border-radius:var(--sp-radius-md,var(--border-radius,14px));padding:16px 20px;box-shadow:var(--sp-shadow-lg,0 10px 40px rgba(15,23,42,.25));display:none;flex-direction:column;align-items:center;gap:12px;min-width:280px;max-width:340px;text-align:center;font-family:var(--sp-font,'Roboto',system-ui,sans-serif);color:var(--sp-text-main,var(--gray-800,#0f172a))}
    .pwa-install-banner.show{display:flex}
    .pwa-install-banner button{border:none;background:var(--sp-primary,var(--primary-color,#4f46e5));color:#fff;padding:8px 12px;border-radius:var(--sp-radius-sm,var(--border-radius,8px));cursor:pointer;font-weight:600}
    .pwa-install-banner .dismiss{background:transparent;color:var(--sp-text-muted,var(--gray-500,#64748b))}
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.className = 'pwa-install-banner';
  banner.innerHTML = isIOS
    ? `<div style="font-weight:600;font-size:16px;">Add RollCall to your Home Screen</div>
      <span>In Safari, tap Share, then Add to Home Screen.</span>
      <div style="display:flex;gap:10px;justify-content:center;width:100%;">
        <button class="dismiss">Got it</button>
      </div>`
    : `<div style="font-weight:600;font-size:16px;">Install App</div>
      <span>Install this app for quicker access</span>
      <div style="display:flex;gap:10px;justify-content:center;width:100%;">
        <button class="install-btn">Install</button>
        <button class="dismiss">Not now</button>
      </div>`;
  document.body.appendChild(banner);

  if (isIOS && !isStandalone) banner.classList.add('show');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.add('show');
  });

  banner.querySelector('.install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    banner.classList.remove('show');
  });
  banner.querySelector('.dismiss').addEventListener('click', () => banner.classList.remove('show'));

  if ('serviceWorker' in navigator) {
    const isStudentPortal = /\/student(?:\/|$)/i.test(window.location.pathname);
    if (isStudentPortal) {
      const studentRoot = new URL('student/', appRoot);
      navigator.serviceWorker.register(new URL('student/sw.js', appRoot), { scope: studentRoot.pathname }).catch(() => {});
    } else {
      navigator.serviceWorker.register(new URL('sw.js', appRoot)).catch(() => {});
    }
  }
})();
