/** Certificate drafts stay editable; issued snapshots are reviewed records of this visit. */
import {
  CERTIFICATE_FIELDS, FIRE_CHECKLISTS, FIRE_CERTIFICATE_TEMPLATES, applyFireCertificateTemplate, createCertificateDraft, saveCertificateDraft,
  certificateReadiness, snapshotCertificatePreview, reviewCertificateDraft,
  issueCertificate, reviseCertificate,
} from './certificates.js';
import { renderCertificate } from './certificate-renderer.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const copy = value => structuredClone(value);
const dateLabel = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
};

export function renderCertificates({ job, site = null, drawing = null, onSave, onPrint, onDownload, onShare, onDirty = () => {} }) {
  const root = document.createElement('section');
  root.className = 'certificates-ui panel';
  root.setAttribute('aria-labelledby', 'certificate-heading');
  let draft = job.certificates?.draft ? copy(job.certificates.draft) : null;
  const issued = job.certificates?.issued || [];
  let selectedIssue = issued.at(-1)?.id || null;
  let pending = false, disposed = false, localDirty = false, reviewing = false;

  const setError = error => {
    const box = root.querySelector('.certificate-error');
    if (!box || disposed) return;
    box.textContent = error?.message || String(error);
    box.hidden = false;
    box.scrollIntoView?.({block: 'nearest'});
  };
  const clearError = () => { const box = root.querySelector('.certificate-error'); if (box) { box.hidden = true; box.textContent = ''; } };
  const updatedJob = certificates => ({ ...copy(job), certificates });
  const perform = async task => {
    if (pending || disposed) return false;
    pending = true;
    clearError();
    root.setAttribute('aria-busy', 'true');
    const controls = [...root.querySelectorAll('button, input, select, textarea')].map(element => [element, element.disabled]);
    controls.forEach(([element]) => { element.disabled = true; });
    try { return await task(); }
    catch (error) { setError(error); return false; }
    finally {
      pending = false;
      if (!disposed) {
        root.setAttribute('aria-busy', 'false');
        controls.forEach(([element, disabled]) => { element.disabled = disabled; });
        updateIssueButton();
      }
    }
  };
  const markChanged = () => {
    localDirty = true;
    if (draft) draft.review = null;
    onDirty(true);
    const status = root.querySelector('.certificate-save-state');
    if (status) status.textContent = 'Unsaved certificate changes';
  };
  const save = async certificates => {
    const saved = await onSave(updatedJob(certificates));
    if (saved === false) throw Error('The certificate could not be saved. Keep this draft open and try again; the last saved issue is unchanged.');
    localDirty = false;
    onDirty(false);
    return true;
  };
  const selectedCertificate = () => issued.find(certificate => certificate.id === selectedIssue);
  const fieldMarkup = field => {
    const value = draft.fields?.[field.key] || '';
    const name = `certificate-${field.key}`;
    const label = `${esc(field.label)}${field.required ? ' <span class="certificate-required" aria-hidden="true">*</span>' : ''}`;
    const control = field.key === 'certificateKind' ? `<select id="${name}" name="certificateKind"><option value="">General visit certificate</option>${Object.entries(FIRE_CERTIFICATE_TEMPLATES).map(([key, template]) => `<option value="${key}"${value === key ? ' selected' : ''}>${esc(template.title)}</option>`).join('')}</select>` : field.type === 'textarea'
      ? `<textarea id="${name}" name="${esc(field.key)}" rows="3" maxlength="10000" aria-required="${field.required ? 'true' : 'false'}">${esc(value)}</textarea>`
      : `<input id="${name}" name="${esc(field.key)}" type="${field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}" maxlength="10000" aria-required="${field.required ? 'true' : 'false'}" value="${esc(value)}">`;
    return `<label class="${field.type === 'textarea' ? 'certificate-wide' : ''}" for="${name}"><span>${label}</span>${control}</label>`;
  };
  const checklistMarkup = () => {
    const checks = FIRE_CHECKLISTS[draft.fields.certificateKind];
    if (!Array.isArray(checks)) return '';
    return '<fieldset><legend>Fire alarm checklist</legend>'+checks.map((label,i)=>{
      const key='fireCheck'+i;
      const [result,...notes]=(draft.fields[key]||'').split('\n');
      return '<div class="certificate-wide"><p><strong>'+esc(label)+'</strong></p><label>Result<select data-fire-check="'+key+'" data-part="result"><option value="">Not recorded</option>'+['Yes','No','N/A'].map(v=>'<option'+(v===result?' selected':'')+'>'+v+'</option>').join('')+'</select></label><label>Notes / evidence<textarea data-fire-check="'+key+'" data-part="notes" maxlength="9900">'+esc(notes.join('\n'))+'</textarea></label></div>';
    }).join('')+'</fieldset>';
  };
  const batteryMarkup = () => draft.fields.certificateKind !== 'commissioning' ? '' : `<fieldset><legend>Battery capacity calculator</legend><p>Enter measured currents in amps. Calculate each PSU separately.</p><div class="certificate-fields">${[['hours','Standby hours'],['standby','Standby current (A)'],['minutes','Alarm duration (minutes)'],['alarm','Alarm current (A)'],['fitted','Fitted capacity (Ah)']].map(([key,label])=>'<label>'+label+'<input type="number" min="0" step="any" data-battery="'+key+'"></label>').join('')}<label>PSU reference<input data-battery="reference"></label></div><p data-battery-result role="status"></p><button type="button" data-battery-add>Calculate and add to evidence</button></fieldset>`;
  const editorMarkup = () => {
    if (!draft) return '';
    const sections = [...new Set(CERTIFICATE_FIELDS.map(field => field.section || 'Certificate details'))].filter(section => section !== 'Fire checklist');
    return `<div class="certificate-draft"><div class="certificate-draft-heading"><div><h3>Certificate draft</h3><p>${draft.revisionOf ? 'Revision of an issued certificate. The earlier issue remains in history.' : 'Details start from the saved job and site. Check and edit them for this certificate.'}</p></div><span class="certificate-status-badge">DRAFT</span></div><p class="certificate-help">Fields marked * are needed before issue. You can save an incomplete draft.</p><form class="certificate-form" novalidate>${sections.map(section => `<fieldset><legend>${esc(section)}</legend><div class="certificate-fields">${CERTIFICATE_FIELDS.filter(field => (field.section || 'Certificate details') === section && (section !== 'Fire certification' || field.key === 'certificateKind' || FIRE_CERTIFICATE_TEMPLATES[draft.fields.certificateKind]?.fields.includes(field.key))).map(fieldMarkup).join('')}</div></fieldset>`).join('')}${checklistMarkup()}${batteryMarkup()}<div class="certificate-save-bar"><span class="certificate-save-state" role="status">Saved draft</span><div class="certificate-actions"><button type="submit">Save draft</button><button type="button" class="primary" data-certificate-review>Review certificate</button></div></div></form><section class="certificate-review" hidden aria-labelledby="certificate-review-heading"><div class="certificate-review-heading"><h3 id="certificate-review-heading" tabindex="-1">Review before issue</h3><button type="button" data-certificate-edit>Back to editing</button></div><div class="certificate-readiness"></div><div class="certificate-review-preview"></div><div class="certificate-confirmation"><label><input type="checkbox" data-certificate-confirm><span>I have checked the certificate details and recorded work for this visit, including any limitations and outstanding actions.</span></label><p>The engineer name is a typed declaration of this review. Jobs does not add a handwritten signature or independent approval.</p><button type="button" class="primary" data-certificate-issue disabled>Issue certificate</button></div></section><button type="button" class="text-button certificate-discard" data-certificate-discard>Discard this draft</button></div>`;
  };
  function updateIssueButton() {
    const button = root.querySelector('[data-certificate-issue]');
    if (!button || !draft) return;
    try {
      const readiness = certificateReadiness(job, draft, site, drawing);
      button.disabled = pending || !root.querySelector('[data-certificate-confirm]')?.checked || readiness.missing.length > 0;
    } catch { button.disabled = true; }
  }
  function displayReview() {
    clearError();
    const readiness = certificateReadiness(job, draft, site, drawing);
    const preview = snapshotCertificatePreview(job, draft, site, drawing);
    const summary = root.querySelector('.certificate-readiness');
    summary.innerHTML = `${readiness.missing.length ? `<div class="certificate-missing"><strong>Complete these details before issue</strong><ul>${readiness.missing.map(value => `<li>${esc(value)}</li>`).join('')}</ul></div>` : '<p class="certificate-ready">Required details are complete. Read the preview before confirming.</p>'}${readiness.warnings.length ? `<details class="certificate-warnings" open><summary>Recorded limitations and items to review</summary><ul>${readiness.warnings.map(value => `<li>${esc(value)}</li>`).join('')}</ul></details>` : ''}`;
    root.querySelector('.certificate-review-preview').replaceChildren(renderCertificate({certificate: preview}));
    root.querySelector('.certificate-form').hidden = true;
    root.querySelector('.certificate-review').hidden = false;
    root.querySelector('[data-certificate-confirm]').checked = false;
    reviewing = true;
    updateIssueButton();
    root.querySelector('#certificate-review-heading').focus();
    root.querySelector('.certificate-review').scrollIntoView?.({block: 'start'});
  }
  function renderIssuedPreview() {
    const certificate = selectedCertificate(), preview = root.querySelector('.certificate-issued-preview');
    if (!preview || !certificate) return;
    preview.replaceChildren(renderCertificate({certificate}));
    const email = certificate.fields?.clientEmail || certificate.snapshot?.fields?.clientEmail || '';
    const contact = root.querySelector('.certificate-customer-email');
    if (contact) { contact.textContent = email ? `Customer email: ${email}` : ''; contact.hidden = !email; }
  }
  function render() {
    root.innerHTML = `<div class="certificate-heading"><div><span class="eyebrow">CUSTOMER DOCUMENT</span><h2 id="certificate-heading">Certificate</h2><p>Create a certificate for this visit, review its details, then save an issued copy for the customer.</p></div>${!draft ? '<button type="button" class="primary" data-certificate-create>Create certificate</button>' : ''}</div><div class="certificate-error notice error" role="alert" hidden></div>${editorMarkup()}${issued.length ? `<section class="certificate-history" aria-labelledby="certificate-history-heading"><div class="certificate-history-heading"><h3 id="certificate-history-heading">Issued certificates</h3><span>${issued.length} saved issue${issued.length === 1 ? '' : 's'}</span></div><label class="certificate-issue-picker">Choose an issue<select aria-label="Issued certificate">${[...issued].reverse().map(certificate => `<option value="${esc(certificate.id)}"${certificate.id === selectedIssue ? ' selected' : ''}>${esc(certificate.fields?.number || certificate.number || 'Certificate')} · ${esc(dateLabel(certificate.issuedAt || certificate.fields?.issueDate))}</option>`).join('')}</select></label><p class="certificate-help">Each issued copy keeps the details and evidence recorded at issue. Use a revision to make changes.</p><div class="certificate-actions"><button type="button" data-certificate-print>Print certificate</button><button type="button" class="primary" data-certificate-download>Download PDF</button><button type="button" data-certificate-share>Share PDF</button><button type="button" data-certificate-revise${draft ? ' disabled' : ''}>Revise certificate</button></div><p class="certificate-help">Choose your email app from Share PDF, or download the PDF and attach it to your customer email.</p><p class="certificate-customer-email" hidden></p>${draft ? '<p class="certificate-help">Finish or discard the current draft before starting another revision.</p>' : ''}<details class="certificate-issued-view" open><summary>View issued certificate</summary><div class="certificate-issued-preview"></div></details></section>` : '<p class="certificate-empty">No certificate has been issued for this visit yet. Your draft job report remains available below.</p>'}`;
    root.querySelector('[data-certificate-create]')?.addEventListener('click', () => perform(() => save(saveCertificateDraft(job, createCertificateDraft(job, site, drawing)))));
    root.querySelector('.certificate-form')?.addEventListener('input', event => {
      if (pending) return;
      if (event.target.dataset.fireCheck) {
        const key = event.target.dataset.fireCheck;
        const result = root.querySelector('[data-fire-check="'+key+'"][data-part="result"]').value;
        const notes = root.querySelector('[data-fire-check="'+key+'"][data-part="notes"]').value;
        draft.fields[key] = result+'\n'+notes; markChanged(); return;
      }
      if (!event.target.name) return;
      if (event.target.name === 'certificateKind') {
        draft = applyFireCertificateTemplate(draft, event.target.value);
        render(); markChanged(); return;
      }
      draft.fields[event.target.name] = event.target.value;
      markChanged();
    });
    root.querySelector('[data-battery-add]')?.addEventListener('click', () => {
      const get = key => root.querySelector('[data-battery="'+key+'"]').value.trim();
      const raw = ['hours','standby','minutes','alarm','fitted'].map(get);
      const [hours,standby,minutes,alarm,fitted] = raw.map(Number);
      const reference = get('reference');
      const output = root.querySelector('[data-battery-result]');
      if (!reference || raw.some(v=>!v || !Number.isFinite(Number(v)) || Number(v)<=0)) { output.textContent='Enter a PSU reference and positive values for all five inputs.'; return; }
      const required = 1.25*(hours*standby+1.75*(minutes/60)*alarm);
      if (!Number.isFinite(required)) { output.textContent='Calculation exceeds numeric range.'; return; }
      const line = reference+': '+hours+' h standby at '+standby+' A; '+minutes+' min alarm at '+alarm+' A; minimum '+(Math.ceil(required*100)/100).toFixed(2)+' Ah; fitted '+fitted+' Ah; '+(fitted>=required?'meets calculated capacity':'below calculated capacity')+'. Capacity only; verify PSU compatibility and battery condition separately.';
      const field = root.querySelector('[name="batteryEvidence"]');
      const next = [draft.fields.batteryEvidence,line].filter(Boolean).join('\n');
      if(next.length>10000){output.textContent='Evidence field is full.';return;}
      draft.fields.batteryEvidence=next;
      if(field) field.value=next;
      output.textContent=line; markChanged();
    });
    root.querySelector('.certificate-form')?.addEventListener('submit', event => {
      event.preventDefault();
      perform(() => save(saveCertificateDraft(job, draft)));
    });
    root.querySelector('[data-certificate-review]')?.addEventListener('click', () => {
      try { displayReview(); } catch (error) { setError(error); }
    });
    root.querySelector('[data-certificate-edit]')?.addEventListener('click', () => {
      reviewing = false;
      root.querySelector('.certificate-review').hidden = true;
      root.querySelector('.certificate-form').hidden = false;
      root.querySelector('[data-certificate-confirm]').checked = false;
      root.querySelector('.certificate-form input, .certificate-form textarea')?.focus();
    });
    root.querySelector('[data-certificate-confirm]')?.addEventListener('change', updateIssueButton);
    root.querySelector('[data-certificate-issue]')?.addEventListener('click', () => perform(async () => {
      if (!reviewing || !root.querySelector('[data-certificate-confirm]')?.checked) throw Error('Review this certificate and confirm its details before issuing.');
      const reviewed = reviewCertificateDraft(job, draft, site, drawing);
      return save(issueCertificate(job, reviewed, site, drawing));
    }));
    root.querySelector('[data-certificate-discard]')?.addEventListener('click', () => {
      if (!confirm('Discard this certificate draft? Issued certificates and the job records will stay saved.')) return;
      perform(() => save({...copy(job.certificates || {version: 1, issued: []}), draft: null}));
    });
    root.querySelector('.certificate-issue-picker select')?.addEventListener('change', event => { selectedIssue = event.target.value; renderIssuedPreview(); });
    for (const [selector, handler] of [['print', onPrint], ['download', onDownload], ['share', onShare]]) {
      root.querySelector(`[data-certificate-${selector}]`)?.addEventListener('click', () => perform(async () => {
        if (localDirty) throw Error('Save the certificate draft before printing or sharing an issued copy.');
        const certificate = selectedCertificate();
        if (!certificate || !handler) throw Error('Choose an issued certificate first.');
        return handler(copy(certificate));
      }));
    }
    root.querySelector('[data-certificate-revise]')?.addEventListener('click', () => perform(() => {
      if (draft) throw Error('Finish or discard the current draft before creating a revision.');
      return save(saveCertificateDraft(job, reviseCertificate(job, selectedIssue)));
    }));
    renderIssuedPreview();
  }
  root.dispose = () => { disposed = true; };
  render();
  return root;
}
