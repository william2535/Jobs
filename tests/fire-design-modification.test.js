import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFireCertificateTemplate,checklistMissing,FIRE_CHECKLISTS} from '../src/certificates.js';
test('design and modification templates use 2025 and never inherit checklist results',()=>{
 const draft={fields:{certificateKind:'installation',fireCheck0:'Yes'},review:{}};
 const design=applyFireCertificateTemplate(draft,'design');
 assert.equal(design.fields.standard,'BS 5839-1:2025');
 assert.equal(design.fields.fireCheck0,'');
 assert.equal(checklistMissing(design.fields).length,8);
 const mod=applyFireCertificateTemplate(design,'modification');
 assert.equal(checklistMissing(mod.fields).length,2);
 assert.equal(checklistMissing({...mod.fields,fireCheck0:'Yes',fireCheck1:'No'}).length,1);
 assert.equal(checklistMissing({...mod.fields,fireCheck0:'Yes',fireCheck1:'N/A\nReason recorded'}).length,0);
});
