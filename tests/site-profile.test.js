import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSiteProfile, jobDefaultsFromSite } from '../src/site-profile.js';

test('empty or older sites do not invent default job details', () => {
  assert.deepEqual(validateSiteProfile(), { version: 1 });
  assert.deepEqual(jobDefaultsFromSite({ name: 'Synthetic site', address: 'Synthetic address', drawings: [{ system: 'Fire alarm' }] }), {});
  assert.deepEqual(jobDefaultsFromSite({ profile: { version: 1, client: ' ', system: '', instructions: '\n' } }), {});
});

test('recorded site fields map to job fields without copying visit evidence', () => {
  const site = {
    id: 'synthetic-site', name: 'Synthetic workshop',
    profile: {
      version: 1, client: 'Synthetic customer', contactName: 'Training contact',
      contactPhone: '00000 000000', contactEmail: 'training@example.invalid',
      accessHours: '09:00–17:00', accessProcedure: 'Check in at reception',
      safetyRequirements: 'Read the local induction', serviceRequirements: 'Agree isolations with site',
      system: 'CCTV', workType: 'General fault or repair work', engineer: 'Training engineer',
      scope: 'Investigate recorded camera fault', instructions: 'Confirm access before arrival',
    },
    drawings: [{ id: 'drawing-1', assets: [{ id: 'asset-1', status: 'Installed' }] }],
  };
  const before = structuredClone(site);
  const defaults = jobDefaultsFromSite(site);
  assert.deepEqual(defaults, {
    system: 'CCTV', workType: 'General fault or repair work', engineer: 'Training engineer',
    scope: 'Investigate recorded camera fault', instructions: 'Confirm access before arrival',
    workflow: {
      version: 1,
      details: {
        client: 'Synthetic customer', contactName: 'Training contact', contactPhone: '00000 000000',
        contactEmail: 'training@example.invalid', accessHours: '09:00–17:00',
        accessProcedure: 'Check in at reception', safetyRequirements: 'Read the local induction',
        serviceRequirements: 'Agree isolations with site',
      },
    },
  });
  assert.deepEqual(site, before);
  assert.equal(defaults.status, undefined);
  assert.equal(defaults.results, undefined);
  assert.equal(defaults.workflow.finalisation, undefined);
  defaults.workflow.details.client = 'Changed for this visit';
  assert.equal(site.profile.client, 'Synthetic customer');
});

test('only recorded fields appear, with no empty workflow containers', () => {
  assert.deepEqual(jobDefaultsFromSite({ profile: { system: ' CCTV ', instructions: 'Check the recorder' } }), {
    system: 'CCTV', instructions: 'Check the recorder',
  });
  assert.deepEqual(jobDefaultsFromSite({ profile: { client: ' Client ', contactPhone: '' } }), {
    workflow: { version: 1, details: { client: 'Client' } },
  });
});

test('normalizing a profile omits whitespace without changing the source object', () => {
  const source = { version: 1, client: '  Synthetic customer  ', contactName: '', scope: '\n\t' };
  const before = structuredClone(source);
  assert.deepEqual(validateSiteProfile(source), { version: 1, client: 'Synthetic customer' });
  assert.deepEqual(source, before);
});

test('site work type accepts every named choice and retains explicit legacy values', () => {
  assert.deepEqual(validateSiteProfile({ workType: ' ', discipline: '' }), { version: 1 });
  for (const workType of ['Maintenance', 'Small works', 'Install', 'Take over visit', 'Call out', 'Fire alarm maintenance', 'General fault or repair work']) {
    assert.deepEqual(validateSiteProfile({ workType: ` ${workType} ` }), { version: 1, workType });
    assert.deepEqual(jobDefaultsFromSite({ profile: { workType } }), { workType });
  }
  assert.throws(() => validateSiteProfile({ workType: 'Unsupported custom work type' }), /work type|job type|classification/i);
});

test('site discipline accepts named choices without inferring a system or visit type', () => {
  for (const discipline of ['Fire', 'Security', 'Intruder', 'CCTV', 'Access control']) {
    assert.deepEqual(validateSiteProfile({ discipline: ` ${discipline} ` }), { version: 1, discipline });
    assert.deepEqual(jobDefaultsFromSite({ profile: { discipline } }), { discipline });
  }
  assert.deepEqual(jobDefaultsFromSite({ profile: { system: 'Fire alarm', workType: 'Fire alarm maintenance' } }), {
    system: 'Fire alarm', workType: 'Fire alarm maintenance',
  }, 'legacy text remains explicit; it does not acquire an inferred discipline');
  assert.throws(() => validateSiteProfile({ discipline: 'Unrecognised discipline' }), /discipline|classification/i);
});

test('custom classifications require recorded names and trim them into independent job defaults', () => {
  const site = { profile: {
    version: 1, discipline: ' Custom ', customDiscipline: '  Gates and barriers  ',
    workType: ' Custom ', customWorkType: '  Survey and condition review  ', client: ' Training customer ',
  } };
  const before = structuredClone(site);
  assert.deepEqual(validateSiteProfile(site.profile), {
    version: 1, discipline: 'Custom', customDiscipline: 'Gates and barriers',
    workType: 'Custom', customWorkType: 'Survey and condition review', client: 'Training customer',
  });
  const firstVisit = jobDefaultsFromSite(site);
  assert.deepEqual(firstVisit, {
    discipline: 'Custom', customDiscipline: 'Gates and barriers', workType: 'Custom',
    customWorkType: 'Survey and condition review', workflow: { version: 1, details: { client: 'Training customer' } },
  });
  assert.deepEqual(site, before, 'normalisation does not mutate the permanent site');
  site.profile.customDiscipline = 'Updated discipline for future visits';
  site.profile.customWorkType = 'Updated work for future visits';
  site.profile.client = 'New customer record';
  const secondVisit = jobDefaultsFromSite(site);
  assert.equal(firstVisit.customDiscipline, 'Gates and barriers');
  assert.equal(firstVisit.customWorkType, 'Survey and condition review');
  assert.equal(firstVisit.workflow.details.client, 'Training customer');
  assert.equal(secondVisit.customDiscipline, 'Updated discipline for future visits');
  assert.equal(secondVisit.customWorkType, 'Updated work for future visits');
  assert.equal(secondVisit.workflow.details.client, 'New customer record');
  firstVisit.workflow.details.client = 'Per-visit edit';
  assert.equal(site.profile.client, 'New customer record');
});

test('custom selections with absent or blank names reject even though site defaults are optional', () => {
  for (const profile of [
    { discipline: 'Custom' }, { discipline: 'Custom', customDiscipline: '  ' },
    { workType: 'Custom' }, { workType: 'Custom', customWorkType: '\n\t' },
    { discipline: 'Custom', customDiscipline: 7 }, { workType: 'Custom', customWorkType: null },
    { discipline: 'Custom', customDiscipline: 'x'.repeat(10001) },
    { workType: 'Custom', customWorkType: 'x'.repeat(10001) },
  ]) {
    const before = structuredClone(profile);
    assert.throws(() => validateSiteProfile(profile), Error);
    assert.throws(() => jobDefaultsFromSite({ profile }), Error);
    assert.deepEqual(profile, before, 'invalid classification does not change the source record');
  }
});

test('normal classification choices clear stale custom names before they enter another visit', () => {
  const source = { version: 1, discipline: 'Fire', customDiscipline: 'Old bespoke discipline', workType: 'Maintenance', customWorkType: 'Old bespoke work' };
  assert.deepEqual(validateSiteProfile(source), { version: 1, discipline: 'Fire', workType: 'Maintenance' });
  assert.deepEqual(jobDefaultsFromSite({ profile: source }), { discipline: 'Fire', workType: 'Maintenance' });
  assert.equal(source.customDiscipline, 'Old bespoke discipline', 'normalisation remains detached');
  assert.equal(source.customWorkType, 'Old bespoke work');
});

test('invalid profile types, versions and unsupported fields are rejected', () => {
  for (const profile of [null, [], 'site', 7, { version: 2 }, { version: '1' }, { client: 5 }, { scope: null }, { passed: true }, { instructions: 'x'.repeat(10001) }]) {
    assert.throws(() => validateSiteProfile(profile), Error);
  }
  assert.throws(() => jobDefaultsFromSite({ profile: { system: ['Fire alarm'] } }), /must be text/);
});

test('one custom site default does not require inventing the other classification', () => {
  assert.deepEqual(jobDefaultsFromSite({ profile: { discipline: 'Custom', customDiscipline: ' Perimeter detection ' } }), {
    discipline: 'Custom', customDiscipline: 'Perimeter detection',
  });
  assert.deepEqual(jobDefaultsFromSite({ profile: { workType: 'Custom', customWorkType: ' Asset audit ' } }), {
    workType: 'Custom', customWorkType: 'Asset audit',
  });
});
