/** Presentation only: dismissing this banner never cancels a save or offline work. */
export const STATUS_BANNER_SESSION_KEY = 'jobs-status-banner-dismissed-v1';
const controls = 'button, a[href], input, select, textarea, summary, [role="button"], [contenteditable="true"]';

/** Local save safety controls this overlay; offline availability remains in Help & data. */
export function canDismissStatusBanner({storageReady, hasRecovery, busy, dirty, saveLabel} = {}) {
  // Failing to cache the app for a future offline visit does not mean already
  // saved job records were lost. Keep actual save/recovery problems visible,
  // but let the engineer dismiss preparation failures and continue working.
  return storageReady === true && !hasRecovery && !busy && !dirty && saveLabel === 'Saved on this device';
}

/** One controller survives re-renders; only its non-sensitive preference is stored. */
export function createStatusBannerController({
  getSessionStorage = () => globalThis.sessionStorage,
  focusAfterDismiss = () => {},
  threshold = 36,
} = {}) {
  if (!Number.isFinite(threshold) || threshold < 24) throw new TypeError('Use a swipe threshold of at least 24 pixels.');
  let dismissed = false, root = null, close = null, status = {}, gesture = null, removeListeners = [];
  try { dismissed = getSessionStorage()?.getItem(STATUS_BANNER_SESSION_KEY) === '1'; } catch { /* Preference-only storage can be unavailable. */ }
  function remember(value) {
    dismissed = value;
    try { if (value) getSessionStorage()?.setItem(STATUS_BANNER_SESSION_KEY, '1'); else getSessionStorage()?.removeItem(STATUS_BANNER_SESSION_KEY); } catch { /* Keep the preference for this page session. */ }
  }
  function update(next = status) {
    status = {...next};
    if (!root) return;
    const allowed = canDismissStatusBanner(status);
    root.dataset.statusDismissible = String(allowed);
    close.hidden = !allowed;
    close.disabled = !allowed;
    const hidden = allowed && dismissed;
    root.hidden = hidden;
    // The existing responsive banner rules use !important display declarations.
    if (hidden) root.style.setProperty('display', 'none', 'important');
    else root.style.removeProperty('display');
    if (!allowed) gesture = null;
  }
  function dismiss() {
    if (!root || !canDismissStatusBanner(status)) return false;
    const returnFocus = root.contains(root.ownerDocument.activeElement);
    remember(true);
    gesture = null;
    update();
    if (returnFocus) focusAfterDismiss();
    return true;
  }
  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    removeListeners.push(() => target.removeEventListener(name, handler, options));
  }
  function originAllowed(event) {
    const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    return root && !root.hidden && canDismissStatusBanner(status) && target && root.contains(target) && !target.closest(controls);
  }
  function move(x, y) {
    if (!gesture) return;
    const dx = Math.abs(x - gesture.x), dy = Math.abs(y - gesture.y);
    // Once the gesture is a vertical scroll, it cannot turn into a dismissal.
    if (dy > 12 && dy > dx) gesture = null;
  }
  function finish(x, y) {
    if (!gesture) return;
    const dx = Math.abs(x - gesture.x), dy = Math.abs(y - gesture.y);
    gesture = null;
    if (dx >= threshold && dx >= dy * 1.6) dismiss();
  }
  function unmount() {
    removeListeners.forEach(remove => remove()); removeListeners = [];
    gesture = null; root = null; close = null;
  }
  function mount(element, next) {
    unmount();
    if (!element?.ownerDocument) return;
    root = element;
    const doc = root.ownerDocument, win = doc.defaultView;
    root.dataset.statusBanner = '';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    root.style.touchAction = 'pan-y';
    root.style.setProperty('pointer-events', 'auto', 'important');
    close = root.querySelector('.connection-dismiss') || doc.createElement('button');
    close.type = 'button'; close.className = 'connection-dismiss';
    close.setAttribute('aria-label', 'Hide saved and offline status');
    close.title = 'Hide status. You can still check it in Help & data.';
    close.textContent = '×';
    if (!close.parentElement) root.append(close);
    listen(close, 'click', event => { event.preventDefault(); dismiss(); });
    listen(root, 'keydown', event => {
      if (event.key === 'Escape' && dismiss()) { event.preventDefault(); event.stopPropagation(); }
    });
    if (win?.PointerEvent) {
      listen(root, 'pointerdown', event => {
        if (event.isPrimary === false) { gesture = null; return; }
        if (event.pointerType === 'mouse' || event.button > 0 || !originAllowed(event)) return;
        gesture = {id: event.pointerId, x: event.clientX, y: event.clientY};
      }, {passive: true});
      listen(doc, 'pointerdown', event => { if (gesture && event.pointerId !== gesture.id) gesture = null; }, {passive: true});
      listen(doc, 'pointermove', event => { if (gesture?.id === event.pointerId) move(event.clientX, event.clientY); }, {passive: true});
      listen(doc, 'pointerup', event => { if (gesture?.id === event.pointerId) finish(event.clientX, event.clientY); }, {passive: true});
      listen(doc, 'pointercancel', () => { gesture = null; }, {passive: true});
    } else {
      // Older WebViews have Touch Events only. Never prevent native page scrolling.
      listen(root, 'touchstart', event => {
        if (event.touches.length !== 1 || !originAllowed(event)) { gesture = null; return; }
        const touch = event.touches[0]; gesture = {id: touch.identifier, x: touch.clientX, y: touch.clientY};
      }, {passive: true});
      listen(doc, 'touchstart', event => { if (event.touches.length !== 1) gesture = null; }, {passive: true});
      listen(doc, 'touchmove', event => {
        if (event.touches.length !== 1) { gesture = null; return; }
        const touch = Array.from(event.touches).find(item => item.identifier === gesture?.id);
        if (touch) move(touch.clientX, touch.clientY);
      }, {passive: true});
      listen(doc, 'touchend', event => {
        const touch = Array.from(event.changedTouches).find(item => item.identifier === gesture?.id);
        if (touch) finish(touch.clientX, touch.clientY);
      }, {passive: true});
      listen(doc, 'touchcancel', () => { gesture = null; }, {passive: true});
    }
    listen(win || doc, 'blur', () => { gesture = null; });
    update(next);
  }
  return {mount, update, dismiss, show() { remember(false); update(); }, dispose: unmount};
}
