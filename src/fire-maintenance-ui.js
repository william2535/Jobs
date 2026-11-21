/** Engineer-entered maintenance evidence. Saving never changes device results. */
import {
  FIRE_SYSTEM_QUESTIONS,
  FIRE_EQUIPMENT_TEMPLATES,
  createFireMaintenanceDraft,
  createFireMaintenanceEquipment,
  saveFireMaintenance,
} from './fire-maintenance.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const detailsFields = [
  ['visitDate', 'Visit date', 'date'],
  ['engineer', 'Engineer', 'text'],
  ['company', 'Company', 'text'],
  ['serviceInterval', 'Service interval', 'text'],
  ['standard', 'Applicable standard and edition', 'text'],
  ['scope', 'Scope of maintenance', 'textarea'],
  ['limitations', 'Limitations / variations', 'textarea'],
  ['conditionLeft', 'Condition left', 'textarea'],
  ['nextActions', 'Next actions / recommendations', 'textarea'],
  ['engineerName', 'Engineer acknowledgement name', 'text'],
  ['engineerDate', 'Engineer acknowledgement date', 'date'],
  ['clientName', 'Client acknowledgement name', 'text'],
  ['clientUnavailableReason', 'Client unavailable / acknowledgement not obtained', 'textarea'],
];
const hasValue = answer => answer.value !== null && answer.value !== undefined && answer.value !== '';
const needsReason = (question, answer) => (question.explanationRequiredFor || []).includes(answer.value);
const isResult = question => ['Pass', 'Fail', 'N/A'].every(value => question.options?.includes(value));
const resultLabel = value => value === 'N/A' ? 'Not applicable' : value;
const countRecorded = answers => Object.values(answers).filter(hasValue).length;
const equipmentKind = template => template.id === 'fire-panel' ? 'panel' : 'battery';
const assetLabel = asset => [asset.reference, asset.typeName || asset.type].filter(Boolean).join(' · ') || asset.id;

export function renderFireMaintenance({ job, site, drawing, onSave, onDirty = () => {} }) {
  const root = document.createElement('section');
  root.className = 'fire-maintenance';
  let currentJob = job, draft = createFireMaintenanceDraft(job, drawing), dirty = false;
  let saving = false, disposed = false, picker = null;
  let openSections = new Set(['site-checks']);
  const assets = Array.isArray(drawing?.assets) ? drawing.assets : [];

  function changed() {
    if (saving || disposed) return;
    dirty = true;
    const form = root.querySelector('form'); if (form) form.dataset.dirty = 'true';
    const status = root.querySelector('.fire-maintenance-save-state');
    if (status) status.textContent = 'Unsaved maintenance changes';
    onDirty(true);
    updateProgress();
  }
  function progress() {
    const answers = [draft.systemAnswers, ...draft.equipment.map(item => item.answers)];
    return { recorded: answers.reduce((sum, group) => sum + countRecorded(group), 0), total: answers.reduce((sum, group) => sum + Object.keys(group).length, 0) };
  }
  function updateProgress() {
    const status = progress();
    const output = root.querySelector('.fire-maintenance-progress');
    if (output) output.textContent = `${status.recorded} / ${status.total} recorded`;
    root.querySelectorAll('[data-group-progress]').forEach(output => {
      const answers = output.dataset.groupProgress === 'site' ? draft.systemAnswers : draft.equipment.find(item => item.id === output.dataset.groupProgress)?.answers;
      if (answers) output.textContent = `${countRecorded(answers)} / ${Object.keys(answers).length}`;
    });
  }
  function showError(error) {
    const box = root.querySelector('.fire-maintenance-error');
    if (box) { box.textContent = error.message || String(error); box.hidden = false; }
  }
  function rememberSections() {
    openSections = new Set([...root.querySelectorAll('details[data-section-id][open]')].map(section => section.dataset.sectionId));
  }
  function answerFor(row) {
    const group = row.closest('[data-equipment-id]');
    const equipment = group && draft.equipment.find(item => item.id === group.dataset.equipmentId);
    const questions = equipment ? FIRE_EQUIPMENT_TEMPLATES.find(template => template.id === equipment.templateId).questions : FIRE_SYSTEM_QUESTIONS;
    const answers = equipment ? equipment.answers : draft.systemAnswers;
    return { question: questions.find(question => question.id === row.dataset.checkId), answer: answers[row.dataset.checkId] };
  }
  function questionMarkup(question, answer) {
    const recorded = hasValue(answer), required = needsReason(question, answer);
    const choices = isResult(question);
    const control = choices
      ? `<div class="fire-check-choice" role="group" aria-label="${esc(question.label)}">${question.options.map(value => `<button type="button" data-result-value="${esc(value)}" aria-label="${esc(question.label)}: ${esc(resultLabel(value))}" aria-pressed="${answer.value === value}">${value}</button>`).join('')}</div>`
      : question.type === 'choice'
        ? `<select data-answer-value aria-label="${esc(question.label)}"><option value="">Not recorded</option>${question.options.map(value => `<option value="${esc(value)}"${answer.value === value ? ' selected' : ''}>${esc(value)}</option>`).join('')}</select>`
        : `<label class="fire-check-value"><span class="sr-only">${esc(question.label)}</span><input data-answer-value aria-label="${esc(question.label)}" type="${question.type === 'number' ? 'number' : 'text'}"${question.type === 'number' ? ` step="${question.integer ? '1' : 'any'}"${question.min !== undefined ? ` min="${esc(question.min)}"` : ''} inputmode="decimal"` : ' maxlength="10000"'} value="${esc(answer.value ?? '')}">${question.unit ? `<span aria-hidden="true">${esc(question.unit)}</span>` : ''}</label>`;
    return `<article class="fire-check-item" data-check-id="${esc(question.id)}"><span class="fire-check-label">${esc(question.label)}${question.unit ? ` (${esc(question.unit)})` : ''}</span><div class="fire-check-controls">${control}${choices ? `<span class="fire-check-state">${recorded ? esc(resultLabel(answer.value)) : 'Not recorded'}</span>` : ''}<button type="button" class="fire-check-clear" data-clear-answer aria-label="Clear ${esc(question.label)}"${recorded ? '' : ' hidden'}>Clear</button></div>${question.hint ? `<p class="fire-maintenance-help">${esc(question.hint)}</p>` : ''}<details class="fire-check-notes"${answer.notes || required ? ' open' : ''}><summary>${required ? 'Explanation required' : 'Notes'}</summary><label>Notes for ${esc(question.label)}<textarea data-answer-notes aria-label="Notes for ${esc(question.label)}" maxlength="10000" rows="2"${required ? ' required' : ''}>${esc(answer.notes)}</textarea></label></details></article>`;
  }
  function equipmentMarkup(item) {
    const template = FIRE_EQUIPMENT_TEMPLATES.find(template => template.id === item.templateId);
    const sectionId = `equipment:${item.id}`;
    const linked = assets.find(asset => asset.id === item.assetId);
    return `<details class="fire-maintenance-equipment" data-section-id="${esc(sectionId)}" data-equipment-id="${esc(item.id)}" data-check-kind="${equipmentKind(template)}"${openSections.has(sectionId) ? ' open' : ''}><summary><span data-equipment-title>${esc(item.label)}</span><small data-group-progress="${esc(item.id)}">${countRecorded(item.answers)} / ${template.questions.length}</small></summary><div class="fire-maintenance-equipment-body"><div class="fire-maintenance-equipment-head"><p>${item.assetId ? linked ? `Drawing asset · ${esc(assetLabel(linked))}` : 'Drawing asset reference retained' : 'Not listed in the drawing'}</p><button type="button" data-remove-equipment="${esc(item.id)}" aria-label="Remove ${esc(item.label)} checks">Remove</button></div><label class="fire-maintenance-equipment-label">Equipment label<input data-equipment-label="${esc(item.id)}" aria-label="Equipment label" value="${esc(item.label)}" maxlength="300" required></label><div class="fire-check-grid">${template.questions.map(question => questionMarkup(question, item.answers[question.id])).join('')}</div></div></details>`;
  }
  function pickerMarkup(template) {
    if (picker?.templateId !== template.id) return '';
    return `<div class="fire-maintenance-equipment-picker"><h4>${template.id === 'fire-panel' ? 'Add panel checks' : 'Add battery checks'}</h4><div class="fire-maintenance-picker-grid"><label>Equipment<select data-picker-asset aria-label="Equipment"><option value="">Choose equipment</option>${assets.map(asset => `<option value="${esc(asset.id)}"${picker.assetId === asset.id ? ' selected' : ''}>${esc(assetLabel(asset))}</option>`).join('')}<option value="__manual__"${picker.assetId === '__manual__' ? ' selected' : ''}>Not listed</option></select></label><label>Equipment label<input data-picker-label aria-label="Equipment label" maxlength="300" value="${esc(picker.label)}" placeholder="e.g. Reception panel"></label></div><div class="fire-maintenance-picker-actions"><button type="button" class="primary" data-confirm-equipment>Add checks</button><button type="button" data-cancel-equipment>Cancel</button></div><p class="fire-maintenance-help">Adds checks for this visit. The drawing and asset list stay as recorded.</p></div>`;
  }
  function reportDetailsMarkup() {
    return `<details class="fire-maintenance-section" data-section-id="report-details"${openSections.has('report-details') ? ' open' : ''}><summary>Visit / report details</summary><div class="fire-maintenance-section-body"><div class="fire-maintenance-details-grid">${detailsFields.map(([key, label, type]) => `<label${type === 'textarea' ? ' class="fire-maintenance-wide"' : ''}>${esc(label)}${type === 'textarea' ? `<textarea data-report-field="${key}" aria-label="${esc(label)}" maxlength="10000" rows="2">${esc(draft.fields[key])}</textarea>` : `<input data-report-field="${key}" aria-label="${esc(label)}" type="${type}" maxlength="10000" value="${esc(draft.fields[key])}">`}</label>`).join('')}</div><p class="fire-maintenance-help">Acknowledgement names are typed records. They are not digital signatures.</p></div></details>`;
  }
  function lock(value) {
    root.querySelector('fieldset').disabled = value;
    root.querySelector('fieldset').inert = value;
    root.setAttribute('aria-busy', String(value));
  }
  function updateAnswerRow(row, question, answer) {
    row.querySelectorAll('[data-result-value]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.resultValue === answer.value)));
    const valueInput = row.querySelector('[data-answer-value]');
    if (valueInput) valueInput.value = answer.value ?? '';
    const state = row.querySelector('.fire-check-state');
    if (state) state.textContent = hasValue(answer) ? resultLabel(answer.value) : 'Not recorded';
    row.querySelector('[data-clear-answer]').hidden = !hasValue(answer);
    const required = needsReason(question, answer), notes = row.querySelector('.fire-check-notes');
    notes.querySelector('summary').textContent = required ? 'Explanation required' : 'Notes';
    notes.querySelector('textarea').required = required;
    if (required) notes.open = true;
  }
  function render() {
    if (disposed) return;
    const status = progress();
    root.innerHTML = `<div class="fire-maintenance-heading"><div><h2>Fire maintenance</h2><p>${esc(site?.name || 'This visit')} · Record the checks you carried out.</p></div><span class="fire-maintenance-progress">${status.recorded} / ${status.total} recorded</span></div><div class="fire-maintenance-error notice error" role="alert" hidden></div><form class="fire-maintenance-form" data-fire-maintenance-form data-dirty="${dirty}" novalidate><fieldset class="fire-maintenance-fieldset"><legend class="sr-only">Fire maintenance questions</legend><details class="fire-maintenance-section" data-section-id="site-checks" data-check-kind="site"${openSections.has('site-checks') ? ' open' : ''}><summary>Site checks <small data-group-progress="site">${countRecorded(draft.systemAnswers)} / ${FIRE_SYSTEM_QUESTIONS.length}</small></summary><div class="fire-maintenance-section-body"><div class="fire-check-grid">${FIRE_SYSTEM_QUESTIONS.map(question => questionMarkup(question, draft.systemAnswers[question.id])).join('')}</div></div></details>${FIRE_EQUIPMENT_TEMPLATES.map(template => `<section class="fire-maintenance-section"><div class="fire-maintenance-section-body"><div class="fire-maintenance-section-head"><h3>${template.id === 'fire-panel' ? 'Panel checks' : 'Battery checks'}</h3><button type="button" data-add-equipment="${esc(template.id)}">${template.id === 'fire-panel' ? 'Add panel checks' : 'Add battery checks'}</button></div>${pickerMarkup(template)}${draft.equipment.filter(item => item.templateId === template.id).map(equipmentMarkup).join('') || '<p class="fire-maintenance-empty">No equipment checks added for this visit.</p>'}</div></section>`).join('')}${reportDetailsMarkup()}<div class="fire-maintenance-save-bar"><span class="fire-maintenance-save-state" role="status">${dirty ? 'Unsaved maintenance changes' : currentJob.fireMaintenance?.drawingId === draft.drawingId ? `Revision ${currentJob.fireMaintenance.revision} saved on this device` : 'Save when ready'}</span><button type="submit" class="primary">Save maintenance</button></div></fieldset></form>`;
    const form = root.querySelector('form');
    root.querySelectorAll('.fire-check-item').forEach(row => {
      const { question, answer } = answerFor(row);
      row.querySelectorAll('[data-result-value]').forEach(button => { button.onclick = () => {
        if (saving || disposed) return;
        answer.value = button.dataset.resultValue; updateAnswerRow(row, question, answer); changed();
      }; });
      const value = row.querySelector('[data-answer-value]');
      if (value) value.addEventListener(question.type === 'choice' ? 'change' : 'input', () => {
        answer.value = value.value === '' ? null : question.type === 'number' ? Number(value.value) : value.value;
        row.querySelector('[data-clear-answer]').hidden = !hasValue(answer);
        if (question.type === 'choice') updateAnswerRow(row, question, answer);
        changed();
      });
      row.querySelector('[data-answer-notes]').oninput = event => { answer.notes = event.target.value; changed(); };
      row.querySelector('[data-clear-answer]').onclick = () => { answer.value = null; updateAnswerRow(row, question, answer); changed(); };
    });
    root.querySelectorAll('[data-report-field]').forEach(input => { input.oninput = () => { draft.fields[input.dataset.reportField] = input.value; changed(); }; });
    root.querySelectorAll('[data-equipment-label]').forEach(input => { input.oninput = () => {
      const item = draft.equipment.find(item => item.id === input.dataset.equipmentLabel); item.label = input.value;
      input.closest('[data-equipment-id]').querySelector('[data-equipment-title]').textContent = input.value || 'Equipment checks'; changed();
    }; });
    root.querySelectorAll('[data-add-equipment]').forEach(button => { button.onclick = () => {
      if (picker && (picker.label || picker.assetId) && !confirm('Discard the equipment selection that has not been added?')) return;
      rememberSections(); picker = { templateId: button.dataset.addEquipment, assetId: '', label: '' }; render();
      root.querySelector('[data-picker-asset]')?.focus();
    }; });
    root.querySelector('[data-picker-asset]')?.addEventListener('change', event => {
      picker.assetId = event.target.value;
      const asset = assets.find(asset => asset.id === picker.assetId);
      picker.label = asset ? String(asset.reference || asset.typeName || asset.type || '') : '';
      root.querySelector('[data-picker-label]').value = picker.label; changed();
    });
    root.querySelector('[data-picker-label]')?.addEventListener('input', event => { picker.label = event.target.value; changed(); });
    root.querySelector('[data-cancel-equipment]')?.addEventListener('click', () => { rememberSections(); picker = null; render(); });
    root.querySelector('[data-confirm-equipment]')?.addEventListener('click', () => {
      try {
        if (!picker.assetId) throw Error('Choose a drawing asset or select Not listed.');
        if (!picker.label.trim()) throw Error('Add an equipment label so these checks can be identified.');
        const asset = picker.assetId === '__manual__' ? null : assets.find(asset => asset.id === picker.assetId);
        if (picker.assetId !== '__manual__' && !asset) throw Error('The selected drawing asset is unavailable. Choose it again.');
        if (draft.equipment.length >= 100) throw Error('Keep at most 100 equipment check records in this visit.');
        const item = createFireMaintenanceEquipment(picker.templateId, asset); item.label = picker.label.trim();
        draft.equipment.push(item); rememberSections(); openSections.add(`equipment:${item.id}`); picker = null; changed(); render();
      } catch (error) { showError(error); }
    });
    root.querySelectorAll('[data-remove-equipment]').forEach(button => { button.onclick = () => {
      const item = draft.equipment.find(item => item.id === button.dataset.removeEquipment);
      if (!confirm(`Remove the ${item.label} checks from this maintenance record?`)) return;
      draft.equipment = draft.equipment.filter(candidate => candidate.id !== item.id); rememberSections(); changed(); render();
    }; });
    form.onsubmit = async event => {
      event.preventDefault();
      if (saving || disposed) return;
      root.querySelector('.fire-maintenance-error').hidden = true;
      changed();
      try {
        if (picker) throw Error('Add the selected equipment checks or cancel the equipment selection before saving.');
        const invalid = [...form.querySelectorAll('input,textarea,select')].find(input => !input.checkValidity());
        if (invalid) {
          for (let parent = invalid.parentElement; parent && parent !== root; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
          invalid.focus(); invalid.reportValidity();
          throw Error(invalid.required && !invalid.value.trim() ? 'Complete the required explanation or equipment label before saving.' : 'Check the highlighted value before saving.');
        }
        const checked = saveFireMaintenance(currentJob, draft, drawing);
        saving = true; lock(true); root.querySelector('.fire-maintenance-save-state').textContent = 'Saving maintenance…';
        const saved = await onSave(checked);
        if (saved !== true) throw Error('Maintenance was not saved. Your entries are still here; try again.');
        currentJob = { ...currentJob, fireMaintenance: checked, revision: checked.basedOnJobRevision };
        draft = createFireMaintenanceDraft(currentJob, drawing); dirty = false; onDirty(false);
        if (!disposed) { rememberSections(); render(); }
      } catch (error) {
        if (!disposed) { showError(error); root.querySelector('.fire-maintenance-save-state').textContent = 'Not saved — retry'; }
      } finally { saving = false; if (!disposed) lock(false); }
    };
    if (saving) lock(true);
  }
  root.dispose = () => { disposed = true; };
  render();
  return root;
}
