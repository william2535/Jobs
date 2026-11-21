import test from 'node:test';
import assert from 'node:assert/strict';
import { newSite, newJob } from '../src/model.js';
import { createJobPackage, importJobPackage } from '../src/packages.js';

test('a job requires an existing named site folder and uses its saved drawing', () => {
  assert.throws(() => newJob(newSite('')), /named site/);
  const site = newSite('Synthetic site folder');
  const job = newJob(site);
  assert.equal(job.siteId, site.id);
  assert.equal(job.drawingId, site.drawings[0].id);
  assert.equal(job.system, '');
  assert.equal(job.workType, '');
  assert.equal(job.status, 'Open');
  assert.equal(job.workflow, undefined);
});

test('recorded site details fill independent new visits without altering existing work', () => {
  const site = newSite('Synthetic site folder');
  site.profile = {version: 1, client: 'Training client', accessProcedure: 'Call on arrival', engineer: 'Engineer A', scope: 'Recorded site scope'};
  const first = newJob(site, {scope: 'This visit only'});
  assert.equal(first.scope, 'This visit only');
  assert.equal(first.engineer, 'Engineer A');
  assert.equal(first.workflow.details.client, 'Training client');
  assert.equal(Object.hasOwn(first.workflow.details, 'contactEmail'), false);
  first.workflow.details.client = 'Visit-specific client';
  site.profile.engineer = 'Engineer B';
  const second = newJob(site);
  assert.equal(second.workflow.details.client, 'Training client');
  assert.equal(second.engineer, 'Engineer B');
  assert.equal(first.engineer, 'Engineer A');
  assert.notEqual(first.id, second.id);
});

test('site defaults travel with job packages; malformed profiles reject before changing existing jobs', async () => {
  const site = newSite('Synthetic folder');
  site.profile = {version: 1, client: 'Synthetic client', contactPhone: '01234 000000'};
  const job = newJob(site);
  const wire = await createJobPackage(site, job);
  const imported = await importJobPackage({sites: [], jobs: []}, wire);
  assert.deepEqual(imported.state.sites[0].profile, site.profile);
  assert.equal(imported.job.workflow.details.client, site.profile.client);
  const invalid = structuredClone(wire);
  invalid.site.profile.client = {invalid: true};
  const before = structuredClone(imported.state);
  await assert.rejects(() => importJobPackage(imported.state, invalid), /Site profile client/);
  assert.deepEqual(imported.state, before);
});
