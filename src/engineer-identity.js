/** A local display tag, not an account or proof of identity. */
import { adoptSiteSettings } from './job-settings.js';

const STORAGE_KEY = 'jobs.work-engineer';
const controls = /[\p{Cc}\p{Cf}]/u;

export function normaliseEngineerName(value, { required = true } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw Error('Enter your engineer name as text.');
  if (controls.test(value)) throw Error('Use your name without control or hidden formatting characters.');
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (name.length > 200) throw Error('Use an engineer name of at most 200 characters.');
  if (required && !name) throw Error('Enter your name so the office can identify your jobs and time.');
  return name;
}

export const engineerKey = value => normaliseEngineerName(value, { required: false }).toLowerCase();

export function readEngineerName(storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    return normaliseEngineerName(target?.getItem(STORAGE_KEY) || '', { required: false });
  } catch { return ''; }
}

/** A denied convenience preference never means that job/day records were saved. */
export function writeEngineerName(value, storage) {
  const name = normaliseEngineerName(value);
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target?.setItem) return false;
    target.setItem(STORAGE_KEY, name);
    return true;
  } catch { return false; }
}

/** Pin the confirmed engineer to these job copies so ordinary exports keep the tag. */
export function tagDayJobs(state, jobIds, value, { at = new Date().toISOString() } = {}) {
  const name = normaliseEngineerName(value);
  if (!Array.isArray(jobIds) || !jobIds.length || jobIds.length > 100 || new Set(jobIds).size !== jobIds.length || jobIds.some(id => typeof id !== 'string' || !id))
    throw Error('Choose between 1 and 100 distinct saved jobs to tag.');
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString().slice(0, 10) !== at.slice(0, 10))
    throw Error('The engineer tag time is invalid.');
  if (jobIds.some(id => !state?.jobs?.some(job => job.id === id))) throw Error('Save every selected job before adding its engineer tag.');
  const next = structuredClone(state), selected = new Set(jobIds);
  next.jobs = next.jobs.map(original => {
    if (!selected.has(original.id)) return original;
    const site = next.sites?.find(site => site.id === original.siteId) || null;
    const job = adoptSiteSettings(original, site);
    if (job.engineer === name && job.settings.overrides.engineer === name) return original;
    if (Number.isSafeInteger(job.revision) && job.revision >= Number.MAX_SAFE_INTEGER) throw Error('This job revision cannot be increased. Export its records before creating a new visit.');
    job.engineer = name;
    job.settings.overrides.engineer = name;
    job.revision = Number.isSafeInteger(job.revision) && job.revision > 0 ? job.revision + 1 : 1;
    job.updatedAt = at;
    job.workflow ??= { version: 1 };
    job.workflow.timeline ??= [];
    if (!Array.isArray(job.workflow.timeline) || job.workflow.timeline.length >= 5000) throw Error('The job timeline is full. Export it before recording a separate visit.');
    job.workflow.timeline.push({ id: crypto.randomUUID(), at, action: 'saved', collection: 'details', recordId: job.id, summary: `Engineer tag: ${name}`.slice(0, 200) });
    return job;
  });
  return next;
}
