import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobPackage, importJobPackage, validateJobPackage } from '../src/packages.js';

function fixture() {
  const photo = { id: 'photo-1', caption: 'Synthetic pixel', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN9sAAAAASUVORK5CYII=' };
  const site = { id: 'site-1', name: 'Synthetic site', address: '', sourceKeys: ['floor-source'], drawings: [{ id: 'drawing-1', revision: 'A', floors: [{ id: 'floor-1', name: 'Ground', data: { polygons: [] } }], assets: [{ id: 'asset-1', type: 'smoke', floorId: 'floor-1', photos: [photo] }], source: { original: true }, issuedSnapshots: [] }] };
  const job = { id: 'job-1', siteId: site.id, drawingId: 'drawing-1', revision: 1, system: 'Fire alarm', workType: 'Fire alarm maintenance', scope: '', instructions: '', engineer: '', status: 'Open', createdAt: '2026-01-01T12:00:00Z', updatedAt: '2026-01-01T12:00:00Z', results: [{ id: 'result-1', assetId: 'asset-1', state: 'Not tested', observations: '', notes: '', defects: '', readings: [], photos: [photo] }], aiProposals: [] };
  return { site, job };
}

test('round trip retains all embedded photos, original drawing, stable IDs and revisions', async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  const imported = await importJobPackage({ sites: [], jobs: [] }, JSON.stringify(exported));
  assert.equal(imported.state.sites[0].drawings[0].assets[0].photos[0].image, site.drawings[0].assets[0].photos[0].image);
  assert.deepEqual(imported.state.sites[0], site);
  const reexport = await createJobPackage(imported.state.sites[0], imported.job);
  assert.deepEqual(reexport, exported);
});

test('same package and same local snapshot never duplicate a job', async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  let result = await importJobPackage({ sites: [site], jobs: [job] }, exported);
  assert.equal(result.duplicate, true);
  result.job.results[0].notes = 'Further local work';
  result = await importJobPackage(result.state, exported);
  assert.equal(result.duplicate, true);
  assert.equal(result.state.jobs.length, 1);
  assert.equal(result.job.results[0].notes, 'Further local work');
});

test('conflicting package preserves local work, remaps imported IDs and remembers its receipt', async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  job.results[0].notes = 'Keep this local observation';
  const state = { sites: [site], jobs: [job] };
  const imported = await importJobPackage(state, exported);
  assert.equal(imported.conflict, true);
  assert.equal(imported.state.jobs.length, 2);
  assert.equal(imported.state.jobs[0].results[0].notes, 'Keep this local observation');
  assert.notEqual(imported.job.id, job.id);
  assert.equal(imported.job.sourceJobId, job.id);
  assert.equal(imported.job.results[0].sourceResultId, 'result-1');
  assert.equal(state.jobs.length, 1, 'input state is never mutated');
  const repeated = await importJobPackage(imported.state, exported);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.state.jobs.length, 2);
});

test('drawing ID collision retains both drawing versions and local site metadata', async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  site.drawings[0].revision = 'B';
  site.name = 'Local edited site name';
  const imported = await importJobPackage({ sites: [site], jobs: [] }, exported);
  assert.equal(imported.conflict, true);
  assert.equal(imported.state.sites.length, 1);
  assert.equal(imported.state.sites[0].name, 'Local edited site name');
  assert.equal(imported.state.sites[0].drawings.length, 2);
  assert.equal(imported.state.sites[0].importedMetadata[0].site.name, 'Synthetic site');
  assert.notEqual(imported.job.drawingId, 'drawing-1');
  validateJobPackage(await createJobPackage(imported.state.sites[0], imported.job));
});

test('same job remains one visit after a site gains revisions or changes its name', async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  site.name = 'Updated site name';
  site.drawings.push({ ...structuredClone(site.drawings[0]), id: 'drawing-2', revision: 'B' });
  const imported = await importJobPackage({ sites: [site], jobs: [job] }, exported);
  assert.equal(imported.duplicate, true);
  assert.equal(imported.state.jobs.length, 1);
  assert.equal(imported.state.sites.length, 1);
  assert.equal(imported.state.sites[0].drawings.length, 2);
  assert.equal(imported.state.sites[0].name, 'Updated site name');
});

test('missing optional collections normalize safely without losing original source data', async () => {
  const { site, job } = fixture();
  delete site.sourceKeys;
  delete site.address;
  delete site.drawings[0].issuedSnapshots;
  delete site.drawings[0].assets[0].photos;
  delete job.aiProposals;
  delete job.results[0].photos;
  delete job.results[0].notes;
  delete job.results[0].observations;
  delete job.results[0].defects;
  const exported = await createJobPackage(site, job);
  const imported = await importJobPackage({ sites: [], jobs: [] }, exported);
  assert.deepEqual(imported.state.sites[0].sourceKeys, []);
  assert.deepEqual(imported.job.results[0].photos, []);
  assert.equal(imported.job.results[0].observations, '');
  assert.deepEqual(imported.state.sites[0].drawings[0].source, { original: true });
  assert.equal((await importJobPackage(imported.state, exported)).duplicate, true);
});

test('occupied conflict IDs never overwrite records or create duplicate primary keys', async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  job.results[0].notes = 'Local changed work';
  const first = await importJobPackage({ sites: [site], jobs: [job] }, exported);
  const occupied = { ...structuredClone(job), id: first.job.id };
  const result = await importJobPackage({ sites: [site], jobs: [job, occupied] }, exported);
  assert.equal(new Set(result.state.jobs.map(value => value.id)).size, 3);
  assert.equal(result.state.jobs[1].id, occupied.id);
  assert.equal(result.state.jobs[1].results[0].notes, 'Local changed work');
  assert.notEqual(result.job.id, occupied.id);
});

test('different visits importing the same colliding drawing reuse its preserved version', async () => {
  const { site, job } = fixture();
  const exported = await createJobPackage(site, job);
  site.drawings[0].revision = 'Local revision';
  let imported = await importJobPackage({ sites: [site], jobs: [] }, exported);
  const selectedDrawingId = imported.job.drawingId;
  exported.job.id = 'second-visit';
  exported.job.results[0].id = 'second-result';
  imported = await importJobPackage(imported.state, exported);
  assert.equal(imported.state.sites[0].drawings.length, 2);
  assert.equal(imported.job.drawingId, selectedDrawingId);
});

test('invalid JSON, versions, references, duplicate IDs and linked-only photographs are rejected', async () => {
  const { site, job } = fixture();
  const valid = await createJobPackage(site, job);
  assert.throws(() => validateJobPackage('{'), /JSON/);
  for (const change of [
    p => { p.version = 999; },
    p => { p.site.sourceKeys = 'invalid'; },
    p => { p.job.siteId = 'missing'; },
    p => { p.job.drawingId = 'missing'; },
    p => { p.job.results[0].assetId = 'missing'; },
    p => { p.job.results.push(p.job.results[0]); },
    p => { p.job.results[0].photos[0].image = 'https://example.com/photo.jpg'; },
    p => { p.site.drawings[0].floors[0].data.image = 'https://example.com/plan.png'; },
    p => { p.site.drawings[0].assets[0].photos[0].image = 'data:image/svg+xml;base64,PHN2Zz4='; },
    p => { p.job.results[0].state = 'Passed'; },
    p => { p.job.results[0].state = 'Inaccessible'; },
    p => { p.job.results = []; },
  ]) {
    const invalid = structuredClone(valid);
    change(invalid);
    const state = { sites: [site], jobs: [job] };
    const before = JSON.stringify(state);
    await assert.rejects(importJobPackage(state, invalid), /Invalid job package/);
    assert.equal(JSON.stringify(state), before);
  }
});


test('malformed retained site metadata rejects before it can break site review', async () => {
  const {site,job} = fixture();
  const pack = await createJobPackage(site,job);
  pack.site.importedMetadata = [null];
  assert.throws(() => validateJobPackage(pack), /importedMetadata/);
  pack.site.importedMetadata = [{fingerprint: 12,site:{name:'Example'}}];
  assert.throws(() => validateJobPackage(pack), /fingerprint/);
});
