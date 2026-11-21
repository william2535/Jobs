import { isNativePlatform } from './native-platform.js';
import { ANDROID_PRIVACY_POLICY_TEXT, ANDROID_PRIVACY_POLICY_URL } from './android-privacy-policy.js';

/** Release help and data controls. The application owns all storage operations. */
const ACTIONS = new Set([
  'backup-workspace', 'restore-workspace', 'recovery-download', 'persist',
  'offline-retry', 'update-check', 'update-apply',
]);

const element = (tag, text, className = '') => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};

export function renderReleaseHelp({
  version = '', buildId = '', offlineStatus = 'Checking offline readiness…',
  storageStatus = 'Checking local storage…', hasRecovery = false,
  onAction = () => {},
} = {}) {
  const native = isNativePlatform();
  const root = element('section', undefined, 'release-help');
  root.setAttribute('aria-label', 'Help and data');
  const abort = new AbortController();
  let disposed = false, pending = false;
  let status = { offlineStatus, storageStatus, hasRecovery: hasRecovery === true, updateAvailable: false };

  const heading = element('div', undefined, 'release-help-heading');
  heading.append(element('span', 'JOBS / YOUR DEVICE', 'release-help-eyebrow'), element('h1', 'Help & data'));
  const release = element('p', undefined, 'release-help-version');
  release.append(element('span', version ? `Version ${version}` : 'Release version not available'));
  if (buildId) release.append(element('code', String(buildId)));
  heading.append(release);
  const error = element('p', undefined, 'release-help-error');
  error.hidden = true;
  error.setAttribute('role', 'alert');
  root.append(heading, error);

  function button(action, label, primary = false) {
    const control = element('button', label, primary ? 'release-help-primary' : '');
    control.type = 'button';
    control.dataset.helpAction = action;
    return control;
  }
  function card(title) {
    const article = element('article', undefined, 'release-help-card');
    article.append(element('h2', title));
    return article;
  }
  function paragraph(parent, text) { parent.append(element('p', text)); }
  function details(title, paragraphs) {
    const group = element('details', undefined, 'release-help-details');
    group.append(element('summary', title));
    for (const text of paragraphs) paragraph(group, text);
    return group;
  }
  function actions(parent, controls) {
    const row = element('div', undefined, 'release-help-actions');
    row.append(...controls);
    parent.append(row);
  }

  const grid = element('div', undefined, 'release-help-grid');
  const readiness = card('Ready for your next visit');
  const statuses = element('dl', undefined, 'release-help-status');
  statuses.setAttribute('aria-live', 'polite');
  const offlineValue = element('dd'), storageValue = element('dd');
  statuses.append(element('dt', 'Offline app'), offlineValue, element('dt', 'Saved records'), storageValue);
  readiness.append(statuses);
  paragraph(readiness, native
    ? 'The app and included tools are installed on this device. Saved jobs, plans and photographs work offline. Check that the status says “Ready offline” before leaving for site; external websites need a connection.'
    : 'Open Jobs while online and wait for “Ready offline” before leaving for site. Included plans, photos and tools then work without a connection.');
  const updateNotice = element('p', 'An app update is ready. Save your current work before applying it.', 'release-help-update');
  const applyUpdate = button('update-apply', 'Apply update', true);
  readiness.append(updateNotice);
  actions(readiness, [button('offline-retry', native ? 'Check installed app' : 'Prepare offline use'), button('update-check', native ? 'Open Google Play' : 'Check for updates'), applyUpdate]);
  readiness.append(details(native ? 'About the Android app' : 'Install Jobs on this device', native ? [
    'Jobs includes its app files, so you can open this Android edition without first loading the website. App updates are installed through Google Play when available. Updating the hosted website does not replace the files in this installed app.',
    'Save your open work and export a workspace backup before updating or changing device. Keep this app installed; uninstalling it or using Android’s Clear storage control can remove its saved records.',
    'This Android app and the Jobs website have separate storage. To bring existing browser work into an empty Android workspace, export a workspace backup from the browser and restore that file here. No records move automatically.',
  ] : [
    'iPhone or iPad: open this website in Safari, tap Share, then Add to Home Screen. Choose Open as Web App if Safari offers it.',
    'Android: open this website in Chrome, open its menu and choose Install app or Add to Home screen. Desktop: use the browser’s Install app option when available. Menu names can differ by browser.',
    'Installation is optional. Use this same website address and browser profile to return to your records. A different browser, profile or device has its own storage. Check that your saved jobs are present in the installed app before working offline.',
  ]));

  const backups = card('Keep a backup');
  paragraph(backups, native
    ? 'Your work is saved in this Android app, with no account or automatic cloud sync. Export a workspace backup regularly and before changing device, uninstalling Jobs or clearing its app storage.'
    : 'Your work is saved in this browser, with no account or automatic cloud sync. Export a workspace backup regularly and before changing device or clearing website data.');
  actions(backups, [button('backup-workspace', 'Export workspace backup', true), button('restore-workspace', 'Restore workspace backup')]);
  backups.append(details('Backup and restore steps', [
    native
      ? 'Save any open job or timesheet first, then export the workspace backup. Choose a folder in Android’s save dialog and wait for confirmation that the file was saved. Keep a copy somewhere you can recover independently of this app and device.'
      : 'Save any open job or timesheet first, then export the workspace backup. Keep the downloaded file somewhere you can recover independently of this browser. Confirm that the file reached your chosen folder.',
    'A workspace backup contains saved sites, jobs, drawings, attachments, timesheets and saved quick defects. Unsaved edits and separate Toolbox calculator inputs or practice progress are not included.',
    'Restore a workspace backup into an empty Jobs workspace. Existing work is not overwritten. To add individual jobs to a workspace that already has records, use Export job in Finalisation and Import job on Home; conflicting imported work is retained separately.',
    'Job packages and workspace backups contain the included notes, photographs and other site information. They are not encrypted. Share them only with the intended recipient and store them securely.',
  ]));
  if (!native) actions(backups, [button('persist', 'Protect local storage')]);
  paragraph(backups, native
    ? 'Android keeps the workspace in Jobs’ app storage. This does not replace a backup: uninstalling, clearing app storage, device loss or storage failure can remove local records.'
    : 'Protect local storage asks the browser to retain records. It cannot prevent deliberate clearing, device loss or every storage failure, so it does not replace a backup.');

  const recovery = card('If records will not open');
  paragraph(recovery, native
    ? 'An opening or saving error does not mean your previous records were deleted. Keep this editor open if it contains unsaved work. Do not uninstall Jobs or clear its app storage to fix the problem before preserving your records.'
    : 'An opening or saving error does not mean your previous records were deleted. Keep the current tab open if it contains unsaved work. Do not clear website data to fix the problem before preserving your records.');
  paragraph(recovery, 'If saving fails, free space on the device and retry saving from the same editor. Export a backup when records can be opened. A recovery download, when available below, preserves the attempted save in a validated backup file. It remains an unsaved snapshot until you retry successfully or restore that file into an empty workspace.');
  const recoveryDownload = button('recovery-download', native ? 'Save local recovery copy' : 'Download local recovery copy');
  actions(recovery, [recoveryDownload]);
  const recoveryHint = element('p', 'A local recovery copy is available. Keep it private with your other backups.', 'release-help-recovery-hint');
  recovery.append(recoveryHint);

  const privacy = card('Your data and connected apps');
  paragraph(privacy, native
    ? 'The core Jobs app does not upload your customer records and includes no analytics or advertising scripts. Its app files are bundled on this device. Exports go to the document provider and folder you choose; choosing a cloud provider may send that exported file to that service. External websites have their own data handling.'
    : 'The core Jobs app does not upload your customer records and includes no analytics or advertising scripts. The website host receives normal website requests and may process basic request metadata, such as IP address, browser information and request time, to serve and protect the website.');
  paragraph(privacy, native
    ? 'Anyone who can unlock this device and open Jobs may be able to read its saved jobs. Jobs has no separate sign-in or encrypted local vault. Use your device lock and keep exported work private.'
    : 'Anyone who can use this browser profile may be able to read its saved jobs. Jobs has no separate sign-in or encrypted local vault. Use your device lock and your own browser profile on shared equipment. Avoid private or incognito browsing for work you need to keep.');
  if (native) {
    const policy = details('Privacy policy', []);
    policy.classList.add('release-help-policy');
    paragraph(policy, 'This complete policy covers Jobs for Android and is available offline.');
    for (const [index, block] of ANDROID_PRIVACY_POLICY_TEXT.trimEnd().split(/\n\n+/).entries()) {
      if (index === 0 || /^\d+\. /.test(block)) {
        policy.append(element('h3', block));
      } else if (block.startsWith('- ')) {
        const list = element('ul');
        for (const line of block.split('\n')) list.append(element('li', line.slice(2)));
        policy.append(list);
      } else {
        for (const line of block.split('\n')) paragraph(policy, line);
      }
    }
    const online = element('p');
    const link = element('a', 'View the public privacy policy in your browser');
    link.href = ANDROID_PRIVACY_POLICY_URL;
    link.rel = 'noopener noreferrer';
    online.append(link);
    policy.append(online);
    privacy.append(policy);
  }
  privacy.append(details('Reports, drawing editing and FINDR', [
    'Reports are Draft service reports of your recorded work. They are not validated compliance certificates. Checklist completion and tool calculations do not automatically pass equipment.',
    'Zone Sketch and the FINDR logo open separate applications. Their websites may require a connection and have their own storage. Automatic Zone Sketch loading and return require a compatible receiver and configuration; editable drawing export and reviewed file reimport remain available.',
    'The Panel Pal job-context export is available for a future FINDR adapter. No live Panel Pal job connection is supplied in this release. Included Toolbox calculators and FESS practice run locally and remain separate from engineer-confirmed job results.',
  ]));

  grid.append(readiness, backups, recovery, privacy);
  root.append(grid);

  function paintStatus() {
    if (disposed) return;
    offlineValue.textContent = String(status.offlineStatus ?? 'Offline readiness not available');
    storageValue.textContent = String(status.storageStatus ?? 'Storage status not available');
    recoveryDownload.hidden = !status.hasRecovery;
    recoveryHint.hidden = !status.hasRecovery;
    updateNotice.hidden = native || !status.updateAvailable;
    applyUpdate.hidden = native || !status.updateAvailable;
    for (const control of root.querySelectorAll('[data-help-action]')) control.disabled = pending;
    root.setAttribute('aria-busy', String(pending));
  }
  root.addEventListener('click', async event => {
    const control = event.target.closest?.('[data-help-action]');
    if (disposed || pending || !control || !root.contains(control) || control.hidden || control.disabled) return;
    const action = control.dataset.helpAction;
    if (!ACTIONS.has(action)) return;
    pending = true; error.hidden = true; paintStatus();
    try { await onAction(action); }
    catch (cause) {
      if (!disposed) { error.textContent = cause?.message || 'This action could not be completed. Your existing records were not changed by this help screen.'; error.hidden = false; }
    } finally { pending = false; paintStatus(); }
  }, { signal: abort.signal });
  root.setStatus = updates => {
    if (disposed || !updates || typeof updates !== 'object') return;
    for (const key of ['offlineStatus', 'storageStatus']) if (Object.hasOwn(updates, key)) status[key] = updates[key];
    for (const key of ['hasRecovery', 'updateAvailable']) if (Object.hasOwn(updates, key)) status[key] = updates[key] === true;
    paintStatus();
  };
  root.dispose = () => { if (disposed) return; disposed = true; abort.abort(); };
  paintStatus();
  return root;
}
