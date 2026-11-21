import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { clamp, lerp, proj, segmentIntersection, pointInPoly, cbPlanToBoard, cbBoardToPlan, cbEditProjectToSegment } from '../vendor/zonesketch/geometry.js';

const close = (a,b) => assert.ok(Math.abs(a-b)<1e-10, `${a} differs from ${b}`);

test('Zone Sketch projections support wall snapping and degenerate segments', () => {
  const hit = cbEditProjectToSegment({x:.4,y:.2},{x:0,y:0},{x:1,y:0});
  assert.deepEqual(hit,{t:.4,p:{x:.4,y:0},d:.2});
  assert.deepEqual(proj({x:2,y:.5},{x:0,y:0},{x:1,y:0}),{p:{x:1,y:0},t:1});
  assert.deepEqual(proj({x:.4,y:.4},{x:.1,y:.2},{x:.1,y:.2}),{p:{x:.1,y:.2},t:0});
  assert.equal(clamp(-.01),0);
  assert.equal(clamp(1.01),1);
  assert.deepEqual(lerp({x:0,y:0},{x:1,y:.5},.5),{x:.5,y:.25});
});

test('Zone Sketch intersection and polygon routines preserve geometry behavior', () => {
  const crossing = segmentIntersection({x:0,y:.5},{x:1,y:.5},{x:.5,y:0},{x:.5,y:1});
  assert.deepEqual(crossing,{t:.5,u:.5,p:{x:.5,y:.5}});
  assert.equal(segmentIntersection({x:0,y:0},{x:1,y:0},{x:0,y:.5},{x:1,y:.5}),null);
  const room = [{x:.1,y:.1},{x:.8,y:.1},{x:.8,y:.8},{x:.1,y:.8}];
  assert.equal(pointInPoly({x:.4,y:.4},room),true);
  assert.equal(pointInPoly({x:.9,y:.4},room),false);
});

test('Zone Sketch circuit coordinates round trip with the actual inset and span', () => {
  const bounds={x1:.15,y1:.2,x2:.85,y2:.8};
  assert.deepEqual(cbPlanToBoard({x:.15,y:.2},bounds),{x:.045,y:.045});
  const original={x:.51,y:.67};
  const back=cbBoardToPlan(cbPlanToBoard(original,bounds),bounds);
  close(back.x,original.x); close(back.y,original.y);
  assert.deepEqual(cbBoardToPlan({x:20,y:20},bounds),{x:1,y:1});
});

test('source geometry lines and distributed licence remain verbatim', async () => {
  const source=await readFile(new URL('../vendor/zonesketch/geometry.js',import.meta.url),'utf8');
  const provenance=JSON.parse(await readFile(new URL('../vendor/zonesketch/PROVENANCE.json',import.meta.url),'utf8'));
  for(const entry of provenance.exports){
    const exportedLine=source.split('\n').find(line=>line.startsWith(entry.name==='clamp'?'export const clamp=':`export function ${entry.name}(`));
    assert.ok(exportedLine,entry.name);
    assert.equal(createHash('sha256').update(exportedLine.slice('export '.length)).digest('hex'),entry.sourceLineSha256);
  }
  const licence=await readFile(new URL('../vendor/zonesketch/LICENSE',import.meta.url));
  assert.equal(createHash('sha256').update(licence).digest('hex'),provenance.licenseSha256);
  assert.deepEqual(await readFile(new URL('../public/zonesketch-LICENSE.txt',import.meta.url)),licence);
});
