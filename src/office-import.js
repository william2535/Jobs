import { importDayPack } from './day-pack.js';
import { importJobPackage } from './packages.js';

/** Validate the complete upload before the caller atomically saves or acknowledges it. */
export async function prepareOfficeImport(state, files) {
  const selected = Array.from(files || []);
  if (!selected.length || selected.length > 20) throw Error('Choose between 1 and 20 job or day packs.');
  if (selected.some(file => !Number.isFinite(file.size) || file.size < 0 || file.size > 100 * 1024 * 1024))
    throw Error('Each pack must be no larger than 100 MiB.');
  if (selected.reduce((size, file) => size + file.size, 0) > 200 * 1024 * 1024)
    throw Error('Choose fewer packs: one upload can contain up to 200 MiB.');
  let next = state;
  const imported = [], jobs = new Set();
  for (const file of selected) {
    try {
      const text = await file.text();
      let source;
      try { source = JSON.parse(text); } catch { throw Error('This file is not valid JSON.'); }
      if (source?.format === 'JobsDayReceipt') throw Error('This is a return receipt. Receive it through Quick Transfer on the engineer’s device.');
      if (source?.format === 'JobsDayPack') {
        const result = await importDayPack(next, source);
        next = result.state;
        result.jobIds.forEach(id => jobs.add(id));
        imported.push({ name: file.name, kind: source.kind, engineer: source.engineer, duplicate: result.duplicate, conflicts: result.conflicts.length });
      } else {
        const result = await importJobPackage(next, source);
        next = result.state; jobs.add(result.job.id);
        imported.push({ name: file.name, kind: 'job', engineer: result.job.engineer || '', duplicate: result.duplicate, conflicts: result.conflict ? 1 : 0 });
      }
    } catch (cause) {
      throw Error(`${file.name || 'Selected file'}: ${cause.message} No files from this upload have been saved.`);
    }
  }
  return { state: next, imported, jobIds: [...jobs], conflicts: imported.reduce((total, file) => total + file.conflicts, 0), duplicates: imported.filter(file => file.duplicate).length };
}
