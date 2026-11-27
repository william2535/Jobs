import { normaliseEngineerName } from './engineer-identity.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

/** NFC opens this confirmation; only the caller may start or finish a day. */
export function promptEngineerName({ name = '', activeEngineer = '', onConfirm, onCancel = () => {} } = {}) {
  const lockedName = normaliseEngineerName(activeEngineer, { required: false });
  let initial = lockedName;
  if (!initial) { try { initial = normaliseEngineerName(name, { required: false }); } catch { initial = ''; } }
  const dialog = document.createElement('dialog');
  dialog.className = 'toolbox-chest transfer-chest quick-transfer engineer-tag';
  dialog.setAttribute('aria-label', 'Engineer tag');
  dialog.innerHTML = `<header class="toolbox-chest-lid"><div class="toolbox-chest-title-row"><div><small>OFFICE HANDOVER</small><h2>Your engineer tag</h2></div><button type="button" class="toolbox-chest-close" data-engineer-cancel aria-label="Cancel engineer tag">×</button></div></header><div class="toolbox-chest-tray"><p class="transfer-job-title">Your name tags the jobs and time you collect. The office groups returned packs under this name.</p><form class="transfer-day-form" novalidate><label>Your name<input name="engineer" maxlength="200" autocomplete="name" value="${escape(initial)}"${lockedName ? ' readonly' : ''}></label>${lockedName ? '<p>A day is already running for this engineer. Finish that day before changing engineer.</p>' : '<p>Use the same name each day so the office can group your work. Add an initial if another engineer has the same name.</p>'}<p class="transfer-status is-error" role="alert" hidden></p><div class="transfer-day-actions"><button type="button" data-engineer-cancel>Cancel</button><button type="submit" class="primary">Continue as engineer</button></div></form></div>`;
  const form = dialog.querySelector('form'), input = form.elements.engineer, error = dialog.querySelector('[role="alert"]');
  let busy = false, confirmed = false, disposed = false, opener = null;
  function lock(value) {
    busy = value; dialog.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('button,input').forEach(control => { control.disabled = value; });
  }
  function cleanup() {
    if (disposed) return;
    disposed = true;
    dialog.remove();
    if (!confirmed) onCancel();
    if (opener?.isConnected && !document.querySelector('dialog[open]')) opener.focus({ preventScroll: true });
  }
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || disposed) return;
    error.hidden = true;
    try {
      const engineer = normaliseEngineerName(lockedName || input.value);
      if (typeof onConfirm !== 'function') throw Error('The handover is unavailable. Close this window and try again.');
      lock(true);
      const result = await onConfirm(engineer);
      if (result === false) throw Error('Your engineer tag was not confirmed. Try again.');
      confirmed = true;
      if (dialog.open) dialog.close();
      cleanup();
    } catch (cause) {
      if (!disposed) { error.textContent = cause.message || 'The engineer tag could not be confirmed. Try again.'; error.hidden = false; }
    } finally { if (!disposed) lock(false); }
  };
  dialog.querySelectorAll('[data-engineer-cancel]').forEach(button => { button.onclick = () => dialog.closePrompt(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.openPrompt = source => {
    if (disposed) return false;
    opener = source || document.activeElement;
    if (!dialog.isConnected) document.body.append(dialog);
    if (!dialog.open) dialog.showModal();
    input.focus({ preventScroll: true });
    return true;
  };
  dialog.closePrompt = () => {
    if (busy) return false;
    if (dialog.open) dialog.close();
    cleanup();
    return true;
  };
  dialog.dispose = cleanup;
  return dialog;
}
