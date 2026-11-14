import test from 'node:test';
import assert from 'node:assert/strict';
import { newSite, createVisitJob } from '../src/model.js';
import { DISCIPLINES, JOB_TYPES, validateJobClassification, disciplineLabel, jobTypeLabel } from '../src/job-options.js';
import { createJobPackage, importJobPackage, validateJobPackage } from '../src/packages.js';
import { panelContext } from '../src/panel-context.js';

test('creation choices match the specified disciplines and job types', () => {
  assert.deepEqual(DISCIPLINES, ['Fire','Security','Intruder','CCTV','Access control','Custom']);
  assert.deepEqual(JOB_TYPES, ['Maintenance','Small works','Install','Take over visit','Call out','Custom']);
});

test('creating a visit requires a named site, both choices and a nonblank description', () => {
  const site = newSite('Synthetic site');
  const values = {discipline:'Fire',workType:'Maintenance',description:'Inspect the recorded fire system'};
  assert.throws(() => createVisitJob(newSite(''), values), /named site/);
  for (const field of ['discipline','workType','description']) assert.throws(() => createVisitJob(site, {...values,[field]:' '}));
  assert.throws(() => createVisitJob(site, {...values,workType:'Fire alarm maintenance'}), /job type/);
  assert.throws(() => createVisitJob(site, {...values,discipline:'Not an option'}), /discipline/);
});

test('new choices and description preserve inherited site details and selected map without passing equipment', () => {
  const site = newSite('Synthetic site');
  site.profile = {version:1,client:'Training client',engineer:'Training engineer',instructions:'Agree access',workType:'Call out'};
  site.drawings[0].assets.push({id:'asset-1',type:'smoke',photos:[]});
  const job = createVisitJob(site, {discipline:'Fire',workType:'Maintenance',description:'  A new visit  '});
  assert.equal(job.siteId,site.id);
  assert.equal(job.drawingId,site.drawings[0].id);
  assert.equal(job.workType,'Maintenance');
  assert.equal(job.workflow.details.description,'A new visit');
  assert.equal(job.workflow.details.client,'Training client');
  assert.equal(job.engineer,'Training engineer');
  assert.equal(job.instructions,'Agree access');
  assert.equal(job.results[0].state,'Not tested');
  assert.equal(site.profile.workType,'Call out');
});

test('custom names are required, survive packages and appear in Panel Pal context', async () => {
  const values = {discipline:'Custom',workType:'Custom',description:'Synthetic custom visit'};
  assert.throws(() => validateJobClassification(values), /custom discipline/);
  assert.throws(() => validateJobClassification({...values,customDiscipline:'Emergency lighting'}), /custom job type/);
  const site = newSite('Synthetic site');
  const job = createVisitJob(site, {...values,customDiscipline:'Emergency lighting',customWorkType:'Survey'});
  const wire = await createJobPackage(site,job);
  const imported = await importJobPackage({sites:[],jobs:[]},wire);
  assert.equal(disciplineLabel(imported.job),'Emergency lighting');
  assert.equal(jobTypeLabel(imported.job),'Survey');
  assert.equal(imported.job.workflow.details.description,values.description);
  const context = panelContext(imported.state.sites[0],imported.job);
  assert.equal(context.workRequested.disciplineLabel,'Emergency lighting');
  assert.equal(context.workRequested.workTypeLabel,'Survey');
  assert.equal(context.workRequested.description,values.description);
  const invalid = structuredClone(wire);
  invalid.job.customDiscipline = '';
  await assert.rejects(() => importJobPackage(imported.state,invalid), /custom discipline/);
  assert.equal(imported.state.jobs.length,1);
});

test('legacy job types remain supported for editing and unused custom values are cleared', () => {
  const old = validateJobClassification({workType:'Fire alarm maintenance'});
  assert.equal(old.workType,'Fire alarm maintenance');
  assert.equal(old.discipline,'');
  assert.deepEqual(validateJobClassification({discipline:'Security',workType:'Install',customDiscipline:'old',customWorkType:'old'}), {discipline:'Security',workType:'Install',customDiscipline:'',customWorkType:''});
});

test('a custom job type cannot bypass package validation by omitting classification fields', async () => {
  const site = newSite('Synthetic site');
  const job = createVisitJob(site, {discipline:'Fire',workType:'Maintenance',description:'Synthetic visit'});
  const wire = await createJobPackage(site,job);
  for (const key of ['discipline','customDiscipline','customWorkType']) delete wire.job[key];
  wire.job.workType = 'Custom';
  assert.throws(() => validateJobPackage(wire), /custom job type/);
});

test('package classifications normalize without creating false duplicate conflicts', async () => {
  const site = newSite('Synthetic site');
  const job = createVisitJob(site, {discipline:'Custom',customDiscipline:'Emergency lighting',workType:'Custom',customWorkType:'Survey',description:'Synthetic visit'});
  const wire = await createJobPackage(site,job);
  wire.job.discipline = ' Custom ';
  wire.job.customDiscipline = ' Emergency lighting ';
  wire.job.workType = ' Custom ';
  wire.job.customWorkType = ' Survey ';
  const normalized = validateJobPackage(wire);
  assert.equal(disciplineLabel(normalized.job),'Emergency lighting');
  assert.equal(jobTypeLabel(normalized.job),'Survey');
  const imported = await importJobPackage({sites:[site],jobs:[job]},wire);
  assert.equal(imported.duplicate,true);
  assert.equal(imported.state.jobs.length,1);
  const regular = createVisitJob(site, {discipline:'CCTV',workType:'Install',description:'Synthetic install'});
  delete regular.customDiscipline;
  delete regular.customWorkType;
  const roundTrip = await importJobPackage({sites:[site],jobs:[regular]},await createJobPackage(site,regular));
  assert.equal(roundTrip.duplicate,true);
});
