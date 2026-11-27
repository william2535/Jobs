/** A delegated, cancellable shortcut to the same editors as the visible Edit buttons. */
const nativeControls = 'input, textarea, select, option, button, a[href], summary, label, [contenteditable]:not([contenteditable="false"])';
const customControls = '[role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="switch"], [role="slider"], [role="combobox"]';
const unavailable = '[inert], [hidden], [aria-hidden="true"], [aria-disabled="true"]';

export function attachHoldToEdit(root, {
  selector = '[data-hold-edit]',
  onEdit,
  duration = 3000,
  movementTolerance = 10,
  timers = globalThis,
} = {}) {
  if (!root?.ownerDocument || typeof onEdit !== 'function') {
    throw new TypeError('Hold editing requires a root element and an onEdit callback.');
  }
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(movementTolerance) || movementTolerance < 0) {
    throw new TypeError('Hold duration must be positive and movement tolerance nonnegative.');
  }
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const listeners = [];
  const pointers = new Set();
  let active = null;
  let disposed = false;
  let swallowClick = null;

  function listen(node, name, callback, options) {
    node?.addEventListener(name, callback, options);
    listeners.push(() => node?.removeEventListener(name, callback, options));
  }

  function usable(target) {
    return !disposed && !doc.hidden && root.isConnected && target.isConnected
      && root.contains(target) && !target.closest(unavailable);
  }

  function findTarget(event) {
    const origin = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    const target = origin?.closest(selector);
    if (!target || !usable(target) || origin.closest(nativeControls)) return null;
    const customControl = origin.closest(customControls);
    return customControl && customControl !== target ? null : target;
  }

  function cancel() {
    if (!active) return;
    const previous = active;
    active = null;
    timers.clearTimeout(previous.timer);
    previous.observer?.disconnect();
    previous.target.removeAttribute('data-hold-active');
    previous.target.style.removeProperty('--hold-edit-duration');
    previous.feedback.remove();
  }

  function feedback() {
    const indicator = doc.createElement('div');
    indicator.className = 'hold-edit-feedback';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.textContent = 'Keep holding to edit…';
    doc.body.append(indicator);
    return indicator;
  }

  function start(event) {
    if (event.defaultPrevented || event.isPrimary === false || event.button !== 0 || event.buttons !== 1) return;
    if (pointers.size !== 1 || !pointers.has(event.pointerId)) return;
    const target = findTarget(event);
    if (!target) return;
    cancel();
    swallowClick = null;
    const hold = {
      target, pointerId: event.pointerId,
      x: event.clientX, y: event.clientY,
      feedback: feedback(),
    };
    active = hold;
    target.style.setProperty('--hold-edit-duration', `${duration}ms`);
    target.setAttribute('data-hold-active', '');
    // Native touch panning and pointer capture are deliberately left to the browser.
    // Replacing or locking the screen must cancel even if the pointer stays still.
    if (win?.MutationObserver) {
      hold.observer = new win.MutationObserver(() => {
        if (!usable(target)) cancel();
      });
      hold.observer.observe(doc.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['inert', 'hidden', 'aria-hidden', 'aria-disabled'],
      });
    }
    hold.timer = timers.setTimeout(() => {
      if (active !== hold) return;
      const canEdit = usable(target);
      cancel();
      if (!canEdit) return;
      // Suppress the click generated when the held pointer is eventually released.
      // Otherwise it may activate a card's ordinary navigation after opening its editor.
      swallowClick = { target, pointerId: hold.pointerId };
      onEdit(target);
    }, duration);
  }

  function move(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > movementTolerance || event.buttons === 0) cancel();
  }

  function end(event) {
    pointers.delete(event.pointerId);
    if (active?.pointerId === event.pointerId) cancel();
  }

  listen(root, 'pointerdown', start);
  listen(doc, 'pointerdown', (event) => {
    pointers.add(event.pointerId);
    if (pointers.size > 1) cancel();
    // A fresh press always gets its own normal click, even after an earlier hold.
    swallowClick = null;
  }, true);
  listen(doc, 'pointermove', move, { passive: true, capture: true });
  listen(doc, 'pointerup', end, true);
  listen(doc, 'pointercancel', end, true);
  listen(doc, 'lostpointercapture', (event) => {
    if (active?.pointerId === event.pointerId) cancel();
  }, true);
  listen(doc, 'scroll', cancel, { passive: true, capture: true });
  const loseFocus = () => { pointers.clear(); cancel(); };
  listen(win, 'blur', loseFocus);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) loseFocus(); });
  listen(root, 'contextmenu', (event) => {
    if (findTarget(event)) event.preventDefault();
  });
  listen(root, 'click', (event) => {
    if (!swallowClick) return;
    const previous = swallowClick;
    swallowClick = null;
    if (previous.target.contains(event.target) && event.detail !== 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  listen(root, 'keydown', (event) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || !['Enter', ' '].includes(event.key)) return;
    const target = findTarget(event);
    if (!target || doc.activeElement !== target) return;
    event.preventDefault();
    cancel();
    onEdit(target);
  });

  return function dispose() {
    disposed = true;
    cancel();
    pointers.clear();
    swallowClick = null;
    listeners.splice(0).forEach((remove) => remove());
  };
}
