/* A short, local brand introduction. This must never gate opening saved work. */
(() => {
  const intro = document.getElementById('jobs-startup');
  const app = document.getElementById('app');
  const skip = intro?.querySelector('[data-intro-skip]');
  if (!intro || !app || !skip) return;
  const status = value => { intro.dataset.introStatus = value; };
  status('controller-loaded');

  const sessionKey = 'jobs-intro-seen-v2';
  let reducedMotion;
  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (sessionStorage.getItem(sessionKey) === '1') { status('already-seen'); return; }
    if (getComputedStyle(document.documentElement).getPropertyValue('--jobs-intro-ready').trim() !== '1') { status('stylesheet-not-ready'); return; }
  } catch (error) {
    status('startup-error: ' + error.message);
    // With restricted storage or an unsupported browser, open the workspace.
    return;
  }
  if (reducedMotion.matches) { status('reduced-motion'); return; }

  const previousFocus = document.activeElement;
  const previousInert = app.inert;
  const previousAriaHidden = app.getAttribute('aria-hidden');
  const removers = [];
  let autoTimer;
  let exitTimer;
  let state = 'opening';
  let keyboardExit = false;
  let pointer = null;
  let lastTap = null;

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    removers.push(() => target.removeEventListener(type, handler, options));
  }

  function focusWithoutScroll(element) {
    if (!element?.isConnected || element.closest('[inert], [hidden]')) return;
    const tabindex = element.getAttribute('tabindex');
    const temporaryTabindex = element.tabIndex < 0 && tabindex === null;
    if (temporaryTabindex) element.setAttribute('tabindex', '-1');
    try { element.focus({ preventScroll: true }); } catch { /* Focus is optional. */ }
    if (temporaryTabindex) {
      // Removing tabindex from a focused heading immediately blurs it in Chrome.
      // Keep it programmatically focusable until the user moves on naturally.
      if (document.activeElement === element) element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
      else element.removeAttribute('tabindex');
    }
  }

  function finish() {
    if (state === 'done') return;
    state = 'done';
    status('finished: ' + intro.dataset.introStatus);
    clearTimeout(autoTimer);
    clearTimeout(exitTimer);
    removers.splice(0).forEach(remove => remove());
    const focusWasInside = intro.contains(document.activeElement);
    intro.hidden = true;
    app.inert = previousInert;
    if (previousAriaHidden === null) app.removeAttribute('aria-hidden');
    else app.setAttribute('aria-hidden', previousAriaHidden);
    if (!focusWasInside || previousInert) return;
    if (previousFocus && previousFocus !== document.body && previousFocus !== document.documentElement && previousFocus.isConnected) {
      focusWithoutScroll(previousFocus);
    } else {
      // Keyboard dismissal lands at the workspace heading; automatic dismissal
      // retains the normal document tab order without selecting an action.
      focusWithoutScroll(keyboardExit ? app.querySelector('main h1, main h2, h1, button, a[href]') || app : app);
    }
  }

  function dismiss({ keyboard = false, immediate = false } = {}) {
    if (state === 'done') return;
    keyboardExit ||= keyboard;
    if (immediate) return finish();
    if (state === 'leaving') return;
    state = 'leaving';
    pointer = null;
    lastTap = null;
    clearTimeout(autoTimer);
    intro.classList.add('is-leaving');
    // Keep the overlay and inert workspace in place until the exit is finished,
    // so the dismissal gesture cannot activate an action underneath it.
    exitTimer = setTimeout(finish, 380);
  }

  try {
    intro.hidden = false;
    sessionStorage.setItem(sessionKey, '1');
    focusWithoutScroll(intro);
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
    state = 'visible';
    status('visible');

    listen(intro, 'click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.target.closest('[data-intro-skip]')) dismiss({ keyboard: event.detail === 0 });
    });
    listen(intro, 'dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    });
    listen(intro, 'pointerdown', event => {
      if (state !== 'visible') return;
      if (!event.isPrimary || event.button !== 0) {
        pointer = null;
        lastTap = null;
        return;
      }
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
    });
    listen(intro, 'pointermove', event => {
      if (pointer && (event.pointerId !== pointer.id || Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12)) {
        pointer = null;
        lastTap = null;
      }
    });
    listen(intro, 'pointercancel', () => { pointer = null; lastTap = null; });
    listen(intro, 'pointerup', event => {
      if (!pointer || event.pointerId !== pointer.id || state !== 'visible') return;
      const now = performance.now();
      const tapped = now - pointer.at <= 450 && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) <= 12;
      pointer = null;
      if (!tapped) { lastTap = null; return; }
      if (lastTap && now - lastTap.at <= 500 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= 44) {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      } else lastTap = { x: event.clientX, y: event.clientY, at: now };
    });
    listen(document, 'keydown', event => {
      if (state === 'done') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        dismiss({ keyboard: true });
      } else if (event.key === 'Tab') {
        // The single skip control is the dialog's only tab stop.
        event.preventDefault();
        skip.focus({ preventScroll: true });
      }
    }, true);
    listen(document, 'visibilitychange', () => {
      if (document.hidden) dismiss({ immediate: true });
    });
    listen(window, 'pagehide', () => dismiss({ immediate: true }));
    const motionChanged = event => { if (event.matches) dismiss({ immediate: true }); };
    if (typeof reducedMotion.addEventListener === 'function') listen(reducedMotion, 'change', motionChanged);
    else if (typeof reducedMotion.addListener === 'function') {
      reducedMotion.addListener(motionChanged);
      removers.push(() => reducedMotion.removeListener(motionChanged));
    }
    autoTimer = setTimeout(() => dismiss(), 3200);
  } catch (error) {
    status('controller-error: ' + error.message);
    // The independent controller's failure path also restores the workspace.
    finish();
  }
})();
