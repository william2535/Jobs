/** Reusable site information, kept separate from the records of an individual visit. */
import { DISCIPLINES, JOB_TYPES, LEGACY_JOB_TYPES, validateJobClassification } from './job-options.js';

const detailFields = [
  'client', 'contactName', 'contactPhone', 'contactEmail',
  'accessHours', 'accessProcedure', 'safetyRequirements', 'serviceRequirements',
];
const classificationFields = ['discipline', 'customDiscipline', 'workType', 'customWorkType'];
const coreFields = ['system', ...classificationFields, 'engineer', 'scope', 'instructions'];
const profileFields = [...detailFields, ...coreFields];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/** Return an independent profile containing only explicitly recorded, nonblank strings. */
export function validateSiteProfile(profile) {
  if (profile === undefined) return { version: 1 };
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Site profile must be an object.');
  }
  if (profile.version !== undefined && profile.version !== 1) {
    throw new Error('Unsupported site profile version.');
  }
  const normalized = { version: 1 };
  for (const key of Object.keys(profile)) {
    if (key === 'version') continue;
    if (!profileFields.includes(key)) throw new Error(`Unsupported site profile field: ${key}.`);
    const value = profile[key];
    if (typeof value !== 'string' || value.length > 10000) {
      throw new Error(`Site profile ${key} must be text of at most 10,000 characters.`);
    }
    const trimmed = value.trim();
    if (trimmed) normalized[key] = trimmed;
  }
  const classification = validateJobClassification(normalized);
  for (const key of classificationFields) {
    delete normalized[key];
    if (classification[key]) normalized[key] = classification[key];
  }
  return normalized;
}

/** No system, scope, contacts or engineer are inferred from an imported drawing. */
export function jobDefaultsFromSite(site) {
  const profile = validateSiteProfile(site?.profile);
  const defaults = {};
  for (const key of coreFields) if (own(profile, key)) defaults[key] = profile[key];
  const details = {};
  for (const key of detailFields) if (own(profile, key)) details[key] = profile[key];
  if (Object.keys(details).length) defaults.workflow = { version: 1, details };
  return defaults;
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
let nextFormId = 0;

/** An explicit-save site editor. A failed save leaves every entered value in place. */
export function renderSiteProfile({ site, onSave, onDirty = () => {} }) {
  if (!site || typeof onSave !== 'function') throw new TypeError('A site and save callback are required.');
  const root = document.createElement('section');
  root.className = 'site-profile';
  const profile = validateSiteProfile(site.profile);
  const prefix = `site-profile-${++nextFormId}`;
  let currentSite = site;
  let saving = false;
  const input = (label, name, value, options = {}) => {
    const id = `${prefix}-${name}`;
    const attributes = `id="${id}" name="${name}" maxlength="${options.maxLength || 10000}"${options.required ? ' required' : ''}`;
    const field = options.options
      ? `<select id="${id}" name="${name}" aria-labelledby="${id}-label"><option value="">${escapeHtml(options.placeholder || 'No default')}</option>${options.options.map(option => `<option value="${escapeHtml(option)}"${value === option ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`
      : options.area
        ? `<textarea ${attributes} rows="2">${escapeHtml(value)}</textarea>`
        : `<input ${attributes} type="${options.type || 'text'}" value="${escapeHtml(value)}"${options.list ? ` list="${prefix}-${options.list}"` : ''}${options.disabled ? ' disabled' : ''}>`;
    const labelHtml = `<label for="${id}"${options.area ? ' class="site-profile-wide"' : ''}><span id="${id}-label">${label}</span>${field}</label>`;
    return options.customFor ? `<div data-site-custom-choice="${options.customFor}"${options.disabled ? ' hidden' : ''}>${labelHtml}</div>` : labelHtml;
  };
  root.innerHTML = `
    <div class="section-head"><div><h2>Site folder details</h2><p class="muted">Recorded details fill new jobs. Existing visits keep their own records.</p></div></div>
    <div class="site-profile-message notice" role="status" hidden></div>
    <form class="site-profile-form">
      <fieldset class="site-profile-fields">
        <legend class="sr-only">Edit site information</legend>
        <div class="site-profile-grid">
          <section class="site-profile-group" aria-labelledby="${prefix}-identity">
            <h3 id="${prefix}-identity">Site</h3>
            <div class="site-profile-inputs">
              ${input('Site name', 'name', site.name, { required: true, maxLength: 200 })}
              ${input('Address', 'address', site.address, { area: true, maxLength: 2000 })}
            </div>
          </section>
          <section class="site-profile-group" aria-labelledby="${prefix}-contacts">
            <h3 id="${prefix}-contacts">Client and contacts</h3>
            <div class="site-profile-inputs">
              ${input('Client', 'client', profile.client)}
              ${input('Contact name', 'contactName', profile.contactName)}
              ${input('Contact phone', 'contactPhone', profile.contactPhone, { type: 'tel' })}
              ${input('Contact email', 'contactEmail', profile.contactEmail, { type: 'email' })}
            </div>
          </section>
          <section class="site-profile-group" aria-labelledby="${prefix}-access">
            <h3 id="${prefix}-access">Access and requirements</h3>
            <div class="site-profile-inputs">
              ${input('Access hours', 'accessHours', profile.accessHours)}
              ${input('Access procedure', 'accessProcedure', profile.accessProcedure)}
              ${input('Safety requirements', 'safetyRequirements', profile.safetyRequirements, { area: true })}
              ${input('Service requirements', 'serviceRequirements', profile.serviceRequirements, { area: true })}
            </div>
          </section>
          <section class="site-profile-group" aria-labelledby="${prefix}-defaults">
            <h3 id="${prefix}-defaults">New job defaults</h3>
            <p class="muted">Optional. Add only information that applies to the next visit.</p>
            <div class="site-profile-inputs">
              ${input('System', 'system', profile.system, { list: 'systems' })}
              ${input('Discipline', 'discipline', profile.discipline, { options: DISCIPLINES, placeholder: 'No default discipline' })}
              ${input('Custom discipline', 'customDiscipline', profile.customDiscipline, { customFor: 'discipline', required: profile.discipline === 'Custom', disabled: profile.discipline !== 'Custom', maxLength: 120 })}
              ${input('Job type', 'workType', profile.workType, { options: [...JOB_TYPES, ...LEGACY_JOB_TYPES], placeholder: 'No default job type' })}
              ${input('Custom job type', 'customWorkType', profile.customWorkType, { customFor: 'workType', required: profile.workType === 'Custom', disabled: profile.workType !== 'Custom', maxLength: 120 })}
              ${input('Assigned engineer', 'engineer', profile.engineer)}
              ${input('Scope of work', 'scope', profile.scope, { area: true })}
              ${input('Instructions', 'instructions', profile.instructions, { area: true })}
            </div>
          </section>
        </div>
        <datalist id="${prefix}-systems"><option value="Fire alarm"></option><option value="Intruder alarm"></option><option value="CCTV"></option><option value="Access control"></option></datalist>
        <div class="site-profile-actions"><button class="primary" type="submit">Save site details</button><p class="muted">Only the site name is required. Empty optional fields stay out of new jobs.</p></div>
      </fieldset>
    </form>`;

  const form = root.querySelector('form');
  const fields = root.querySelector('fieldset');
  const message = root.querySelector('.site-profile-message');
  const showMessage = (text, error = false) => {
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('error', error);
    message.setAttribute('role', error ? 'alert' : 'status');
  };
  for (const choice of ['discipline', 'workType']) {
    const control = form.elements.namedItem(choice);
    const custom = form.querySelector(`[data-site-custom-choice="${choice}"]`);
    control.addEventListener('change', () => {
      const selected = control.value === 'Custom';
      custom.hidden = !selected;
      const customInput = custom.querySelector('input');
      customInput.disabled = !selected;
      customInput.required = selected;
      message.hidden = true;
      root.dataset.dirty = 'true';
      onDirty(true);
    });
  }
  form.addEventListener('input', () => {
    message.hidden = true;
    root.dataset.dirty = 'true';
    onDirty(true);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || root.closest('[inert]')) return;
    const values = Object.fromEntries(new FormData(form));
    try {
      const name = String(values.name || '').trim();
      if (!name) throw new Error('Enter a site name.');
      const editedProfile = { version: 1 };
      for (const key of profileFields) editedProfile[key] = values[key] || '';
      const next = {
        ...currentSite,
        name,
        address: String(values.address || '').trim(),
        profile: validateSiteProfile(editedProfile),
      };
      saving = true;
      fields.disabled = true;
      form.setAttribute('aria-busy', 'true');
      if (await onSave(next)) {
        currentSite = next;
        root.dataset.dirty = 'false';
        onDirty(false);
        showMessage('Site details saved locally.');
      } else {
        showMessage('Site could not be saved. Your changes are still here; try saving again.', true);
      }
    } catch (error) {
      showMessage(error.message || String(error), true);
    } finally {
      saving = false;
      fields.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
  return root;
}
