/** Explicit single-device outcome selection. The caller saves and revises the job. */
import { states } from './model.js';

export function applyQuickDeviceResult(job, assetId, state, explanation = '') {
  if (!job || !Array.isArray(job.results)) throw Error('This job has no device results.');
  if (!states.includes(state)) throw Error('Choose a supported device result.');
  if (typeof assetId !== 'string' || !assetId || job.results.filter(result => result.assetId === assetId).length !== 1)
    throw Error('Choose one device from this job.');
  if (typeof explanation !== 'string' || explanation.length > 10000) throw Error('Keep the result explanation to 10,000 characters.');
  const next = structuredClone(job), result = next.results.find(result => result.assetId === assetId);
  const entered = explanation.trim();
  if (['Unsatisfactory', 'Inaccessible', 'Not applicable'].includes(state) &&
      ![entered, result.observations, result.notes, result.defects].some(value => typeof value === 'string' && value.trim()))
    throw Error('Add an explanation for this device result.');
  result.state = state;
  if (entered) result.observations = entered;
  result.recordedAt = new Date().toISOString();
  result.recordedBy = typeof job.engineer === 'string' ? job.engineer : '';
  return next;
}
