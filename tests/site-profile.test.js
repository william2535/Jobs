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

test('site work type may be absent or one of the supported job types', () => {
  assert.deepEqual(validateSiteProfile({ workType: ' ' }), { version: 1 });
  for (const workType of ['Fire alarm maintenance', 'General fault or repair work']) {
    assert.deepEqual(validateSiteProfile({ workType: ` ${workType} ` }), { version: 1, workType });
    assert.deepEqual(jobDefaultsFromSite({ profile: { workType } }), { workType });
  }
  assert.throws(() => validateSiteProfile({ workType: 'Unsupported custom work type' }), /supported site work type/);
});

test('invalid profile types, versions and unsupported fields are rejected', () => {
  for (const profile of [null, [], 'site', 7, { version: 2 }, { version: '1' }, { client: 5 }, { scope: null }, { passed: true }, { instructions: 'x'.repeat(10001) }]) {
    assert.throws(() => validateSiteProfile(profile), Error);
  }
  assert.throws(() => jobDefaultsFromSite({ profile: { system: ['Fire alarm'] } }), /must be text/);
});
