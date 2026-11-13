#!/usr/bin/env node
/** Prepare a separate Zone Sketch runtime with the Jobs receiver. Never writes the reference source. */
import {readFile,writeFile,mkdir,cp,stat,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const args=process.argv.slice(2);
const values={};
for(let i=0;i<args.length;i+=2){if(!['--source','--output','--jobs-origin'].includes(args[i])||!args[i+1])throw Error('Usage: node install-bridge.mjs --source /external/zone-sketch --output /external/new-runtime --jobs-origin https://jobs.example');values[args[i].slice(2)]=args[i+1];}
if(!values.source||!values.output||!values['jobs-origin'])throw Error('Source, output and trusted Jobs origin are required.');
const source=resolve(values.source),output=resolve(values.output);
const ownDir=dirname(fileURLToPath(import.meta.url)),jobsRoot=resolve(ownDir,'../..');
const within=(child,parent)=>child===parent||!relative(parent,child).startsWith('..');
if(within(output,jobsRoot)||within(output,source)||within(source,output))throw Error('Output must be separate from Jobs and the reference checkout.');
try{await access(output,constants.F_OK);throw Error('Output already exists. Choose a new temporary directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
const originUrl=new URL(values['jobs-origin']);
if(originUrl.origin!==values['jobs-origin']||!['https:','http:'].includes(originUrl.protocol)||(originUrl.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(originUrl.hostname)))throw Error('Jobs origin must be an exact HTTPS origin, or HTTP localhost for testing.');
const html=await readFile(join(source,'index.html'),'utf8');
const expected='27125148d181114db39b8140da57a261d8755d6dd8f2568f0c1a353c0a8f2b55';
const actual=createHash('sha256').update(html).digest('hex');
if(actual!==expected)throw Error('Zone Sketch source differs from reviewed dca2eff. Review its engine integration points before installing this adapter.');
const anchor='new ResizeObserver(draw).observe(wrap);syncWallSize();updateButtons();syncToolMenus();renderZoneMenu();load();draw();\n})();';
if(html.split(anchor).length!==2)throw Error('Expected one reviewed engine bootstrap anchor.');
let bridge=await readFile(join(ownDir,'jobs-bridge.js'),'utf8');
bridge=bridge.replace('/* JOBS_ALLOWED_ORIGINS */ []','/* JOBS_ALLOWED_ORIGINS */ '+JSON.stringify([originUrl.origin]));
const closing=anchor.lastIndexOf('\n})();');
const patched=html.replace(anchor,anchor.slice(0,closing)+'\n/* BEGIN JOBS COMPANION RECEIVER */\n'+bridge+'\n/* END JOBS COMPANION RECEIVER */'+anchor.slice(closing));
await mkdir(output,{recursive:true});
// Only runtime files; no source history, build caches, APKs, credentials or customer records.
for(const name of ['assets','vendor','manifest.webmanifest','LICENSE']){
  try{await stat(join(source,name));await cp(join(source,name),join(output,name),{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
}
await writeFile(join(output,'index.html'),patched);
await writeFile(join(output,'JOBS-BRIDGE-PROVENANCE.json'),JSON.stringify({sourceRepository:'https://github.com/william2535/FIRE-ZONE-PLAN-APP',sourceCommit:'dca2eff063f52a9980c2aed255879a65cc579379',sourceSha256:actual,bridgeSha256:createHash('sha256').update(bridge).digest('hex'),trustedJobsOrigin:originUrl.origin,publication:'Prepared runtime only; installer does not publish or modify source repository.'},null,2)+'\n');
console.log(JSON.stringify({output,sourceUnchanged:true,requiresDeployment:true,trustedJobsOrigin:originUrl.origin}));
