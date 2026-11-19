/** Shared site setup with explicit per-job overrides. Work evidence stays separate. */
import { DISCIPLINES, JOB_TYPES, LEGACY_JOB_TYPES, validateJobClassification } from './job-options.js';
import { validateSiteProfile } from './site-profile.js';

const contactFields = ['client', 'contactName', 'contactPhone', 'contactEmail', 'accessHours', 'accessProcedure', 'safetyRequirements', 'serviceRequirements'];
const coreFields = ['system', 'discipline', 'customDiscipline', 'workType', 'customWorkType', 'engineer', 'scope', 'instructions'];
const sharedFields = [...coreFields, ...contactFields];
const pairs = [['discipline', 'customDiscipline'], ['workType', 'customWorkType']];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = (value) => structuredClone(value);
const fieldValue = (job, key) => contactFields.includes(key) ? job.workflow?.details?.[key] || '' : job[key] || '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);

export function validateJobSettings(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || Object.keys(value).some(key => !['version', 'overrides'].includes(key)))
    throw Error('Job settings must use version 1.');
  if (!value.overrides || typeof value.overrides !== 'object' || Array.isArray(value.overrides)) throw Error('Job settings overrides must be an object.');
  const overrides = {};
  for (const [key, text] of Object.entries(value.overrides)) {
    if (!sharedFields.includes(key)) throw Error(`Unsupported job setting: ${key}.`);
    if (typeof text !== 'string' || text.length > 10000) throw Error(`Job setting ${key} must be text of at most 10,000 characters.`);
    overrides[key] = text.trim();
  }
  for (const [choice, custom] of pairs) {
    if (own(overrides, choice) !== own(overrides, custom)) throw Error(`Job setting ${choice} must include its custom name field.`);
  }
  const selected = validateJobClassification(overrides);
  for (const [choice, custom] of pairs) if (own(overrides, choice)) {
    overrides[choice] = selected[choice];
    overrides[custom] = selected[custom];
  }
  return { version: 1, overrides };
}

/** Call against the OLD site before changing its profile to identify legacy overrides. */
export function adoptSiteSettings(job, site) {
  const next = clone(job);
  if (job.settings !== undefined) {
    next.settings = validateJobSettings(job.settings);
    return next;
  }
  if (site && job.siteId !== site.id) throw Error('Job settings must use the job’s own site.');
  const profile = validateSiteProfile(site?.profile);
  const overrides = {};
  for (const key of sharedFields) {
    const value = fieldValue(job, key);
    if (value && value !== (profile[key] || '')) overrides[key] = value;
  }
  for (const [choice, custom] of pairs) if (own(overrides, choice) || own(overrides, custom)) {
    overrides[choice] = fieldValue(job, choice);
    overrides[custom] = fieldValue(job, custom);
  }
  next.settings = validateJobSettings({ version: 1, overrides });
  return next;
}

/** A display/report copy: no local records, results, photos or drawing references mutate. */
export function effectiveJob(job, site = null) {
  if (!job) return job;
  if (site && job.siteId !== site.id) throw Error('Job settings must use the job’s own site.');
  const next = adoptSiteSettings(job, site);
  const profile = validateSiteProfile(site?.profile);
  const overrides = next.settings.overrides;
  for (const key of sharedFields) {
    const value = own(overrides, key) ? overrides[key] : site ? profile[key] || '' : fieldValue(job, key);
    if (contactFields.includes(key)) {
      if (value || next.workflow?.details?.[key] !== undefined) {
        next.workflow ??= { version: 1 };
        next.workflow.details ??= {};
        next.workflow.details[key] = value;
      }
    } else next[key] = value;
  }
  return next;
}

/** Preserve only the fields actually changed in an existing job editor. */
export function captureJobOverrides(original, edited, site = null) {
  const baseline = effectiveJob(original, site);
  const next = clone(edited);
  const overrides = clone(baseline.settings.overrides);
  const changed = new Set();
  for (const key of sharedFields) if (fieldValue(edited, key) !== fieldValue(baseline, key)) {
    overrides[key] = fieldValue(edited, key);
    changed.add(key);
  }
  for (const [choice, custom] of pairs) if (changed.has(choice) || changed.has(custom)) {
    overrides[choice] = fieldValue(edited, choice);
    overrides[custom] = fieldValue(edited, custom);
  }
  next.settings = validateJobSettings({ version: 1, overrides });
  return next;
}

const labels = {
  system: 'System', discipline: 'Discipline', customDiscipline: 'Custom discipline', workType: 'Job type', customWorkType: 'Custom job type', engineer: 'Assigned engineer', scope: 'Scope of work', instructions: 'Instructions', client: 'Client', contactName: 'Contact name', contactPhone: 'Contact phone', contactEmail: 'Contact email', accessHours: 'Access hours', accessProcedure: 'Access procedure', safetyRequirements: 'Safety requirements', serviceRequirements: 'Service requirements',
};
const textInput = (key, label, value, area = false) => `<label>${esc(label)}${area ? `<textarea name="${key}" rows="2" maxlength="10000">${esc(value)}</textarea>` : `<input name="${key}" maxlength="10000" value="${esc(value)}">`}</label>`;
const selectInput = (key, label, value, options) => `<label>${esc(label)}<select name="${key}">${options.map(([id, text]) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;

/** Job-card gear editor. Empty metadata is permitted; saving a job needs no site. */
export function renderJobSettings({ job, sites = [], onSave, onDirty = () => {} }) {
  const root = document.createElement('section');
  root.className = 'job-settings panel';
  const currentSite = sites.find(site => site.id === job.siteId) || null;
  const initial = effectiveJob(job, currentSite);
  let overrides = clone(initial.settings.overrides);
  let saving = false, disposed = false;
  const changed = new Set();
  const field = key => {
    const value = fieldValue(initial, key);
    if (key === 'discipline' || key === 'workType') return selectInput(key, labels[key], value, [['', 'Not set'], ...(key === 'discipline' ? DISCIPLINES : [...JOB_TYPES, ...LEGACY_JOB_TYPES]).map(choice => [choice, choice])]);
    return textInput(key, labels[key], value, ['scope', 'instructions', 'safetyRequirements', 'serviceRequirements'].includes(key));
  };
  root.innerHTML = `<div class="section-head"><div><h1>Job settings</h1><p class="muted">Only add what you need. Notes and pictures stay in the job.</p></div></div><div class="job-settings-error notice error" role="alert" hidden></div><form data-job-settings-form data-dirty="false"><fieldset><div class="job-settings-grid">${textInput('title', 'Job title', job.workflow?.details?.title || '')}${selectInput('siteId', 'Site (optional)', job.siteId || '', [['', 'No site'], ...sites.map(site => [site.id, site.name || 'Site'])])}${selectInput('status', 'Status', job.status || 'Open', ['Open', 'In progress', 'Complete'].map(value => [value, value]))}</div><p class="job-settings-inheritance muted"></p><details class="job-settings-more"><summary>More details</summary><div class="job-settings-grid">${field('discipline')}<div data-custom-for="discipline">${field('customDiscipline')}</div>${field('workType')}<div data-custom-for="workType">${field('customWorkType')}</div>${field('engineer')}${field('system')}${textInput('reference', 'Job reference', job.workflow?.details?.reference || '')}${textInput('description', 'Description', job.workflow?.details?.description || '', true)}${field('scope')}${field('instructions')}</div><details><summary>Client, contacts & access</summary><div class="job-settings-grid">${contactFields.map(field).join('')}</div></details><button type="button" data-use-site-settings>Use site settings for this job</button><p class="muted">Changes here apply only to this job. Use site settings to follow the shared setup again.</p></details><div class="job-settings-actions"><button class="primary" type="submit">Save settings</button></div></fieldset></form>`;
  const form = root.querySelector('form'), fieldset = root.querySelector('fieldset'), error = root.querySelector('.job-settings-error');
  const siteInput = form.elements.namedItem('siteId');
  const selectedSite = () => sites.find(site => site.id === siteInput.value) || null;
  const setDirty = () => { form.dataset.dirty = 'true'; error.hidden = true; onDirty(true); };
  if (job.siteId) siteInput.disabled = true;
  function updateHints() {
    const linked = selectedSite();
    root.querySelector('.job-settings-inheritance').textContent = linked
      ? `Uses ${linked.name}'s shared setup. ${job.siteId ? 'The site link and saved plans are kept with this job.' : 'Its current plan will be added when you save.'}`
      : 'A site is optional. You can write and save this job on its own.';
    root.querySelector('[data-use-site-settings]').disabled = !linked;
    for (const [choice, custom] of pairs) {
      const isCustom = form.elements.namedItem(choice).value === 'Custom';
      const input = form.elements.namedItem(custom);
      input.closest('[data-custom-for]').hidden = !isCustom;
      input.disabled = !isCustom;
      input.required = isCustom;
    }
  }
  function refillShared() {
    const profile = validateSiteProfile(selectedSite()?.profile);
    for (const key of sharedFields) if (!changed.has(key)) form.elements.namedItem(key).value = own(overrides, key) ? overrides[key] : profile[key] || '';
    updateHints();
  }
  form.addEventListener('input', event => {
    if (sharedFields.includes(event.target.name)) changed.add(event.target.name);
    setDirty();
  });
  form.addEventListener('change', event => {
    if (sharedFields.includes(event.target.name)) changed.add(event.target.name);
    if (event.target === siteInput) refillShared();
    updateHints();
    setDirty();
  });
  root.querySelector('[data-use-site-settings]').onclick = () => {
    if (saving || disposed || !selectedSite()) return;
    overrides = {};
    changed.clear();
    refillShared();
    setDirty();
  };
  updateHints();
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving || disposed) return;
    error.hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      const next = clone(job);
      const selected = selectedSite();
      const profile = validateSiteProfile(selected?.profile);
      const selectedValues = validateJobClassification(values);
      const nextOverrides = clone(overrides);
      for (const key of changed) {
        const value = String(values[key] || '').trim();
        if (selected && value === (profile[key] || '')) delete nextOverrides[key];
        else nextOverrides[key] = value;
      }
      for (const [choice, custom] of pairs) if (changed.has(choice) || changed.has(custom)) {
        if (selected && selectedValues[choice] === (profile[choice] || '') && selectedValues[custom] === (profile[custom] || '')) {
          delete nextOverrides[choice]; delete nextOverrides[custom];
        } else { nextOverrides[choice] = selectedValues[choice]; nextOverrides[custom] = selectedValues[custom]; }
      }
      next.settings = validateJobSettings({ version: 1, overrides: nextOverrides });
      next.workflow = { ...next.workflow, version: 1, details: { ...next.workflow?.details }, finalisation: { ...next.workflow?.finalisation } };
      for (const key of ['title', 'reference', 'description']) next.workflow.details[key] = String(values[key] || '').trim();
      if (!['Open', 'In progress', 'Complete'].includes(values.status)) throw Error('Choose a valid job status.');
      next.status = values.status;
      next.workflow.finalisation.status = values.status;
      // Materialize current values too, so older readers retain a useful snapshot.
      const effective = effectiveJob({ ...next, siteId: selected?.id || null }, selected);
      for (const key of coreFields) next[key] = effective[key];
      for (const key of contactFields) next.workflow.details[key] = effective.workflow?.details?.[key] || '';
      saving = true; fieldset.disabled = true;
      if (await onSave(next, selected?.id || null) !== true) throw Error('Settings were not saved. Your changes are still here; try again.');
      form.dataset.dirty = 'false';
      onDirty(false);
    } catch (cause) {
      if (!disposed) { error.textContent = cause.message || 'Settings could not be saved.'; error.hidden = false; }
    } finally {
      saving = false;
      if (!disposed) { fieldset.disabled = false; if (job.siteId) siteInput.disabled = true; updateHints(); }
    }
  };
  root.dispose = () => { disposed = true; };
  return root;
}
