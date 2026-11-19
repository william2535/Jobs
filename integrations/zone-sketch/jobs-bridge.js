/*
 * Jobs companion receiver for the original Zone Sketch application.
 * Independently written integration code. Install INSIDE the Zone Sketch engine
 * closure using install-bridge.mjs; it intentionally has no access via globals.
 * This file contains no copied Zone Sketch application implementation.
 */
(() => {
  const protocol = 'jobs-zonesketch';
  const version = 1;
  const allowedOrigins = /* JOBS_ALLOWED_ORIGINS */ [];
  const fragment = new URLSearchParams(location.hash.slice(1));
  const jobsOrigin = fragment.get('jobsOrigin');
  const session = fragment.get('session');
  if (!jobsOrigin || !session) return;
  let origin;
  try {
    const url = new URL(jobsOrigin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== jobsOrigin) return;
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return;
    origin = url.origin;
  } catch { return; }
  if (!allowedOrigins.includes(origin) || !/^[a-zA-Z0-9_-]{16,100}$/.test(session) || !window.opener) return;
  const opener = window.opener;
  let loaded = null;
  let loading = false;
  let pending = null;
  let lastAckSnapshot = null;
  let awaiting = false;
  let readySent = false;
  let timeout;
  const bar = document.createElement('div');
  bar.id = 'jobsBridgeBar';
  bar.setAttribute('aria-label', 'Jobs editing connection');
  bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));z-index:20000;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#332f2b;color:#fff;border:1px solid #b99a79;border-radius:12px;padding:10px;font:13px system-ui;box-shadow:0 4px 20px #0005';
  const status = document.createElement('span');
  status.setAttribute('role','status');
  status.style.cssText = 'flex:1 1 190px';
  status.textContent = 'Connecting to Jobs…';
  const save = document.createElement('button');
  save.type = 'button'; save.textContent = 'Save to Jobs'; save.disabled = true;
  const back = document.createElement('button');
  back.type = 'button'; back.textContent = 'Back to Jobs';
  for (const button of [save,back]) button.style.cssText = 'min-height:44px;border:1px solid #baa28b;border-radius:7px;background:#fcfaf7;color:#332f2b;padding:8px 14px;font:600 13px system-ui;cursor:pointer';
  bar.append(status,save,back);
  document.body.append(bar);
  const reserveSpace=()=>{
    const height=Math.ceil(bar.getBoundingClientRect().height)+18;
    document.querySelector('.app').style.height=`calc(100dvh - ${height}px)`;
    document.querySelector('.app').style.maxHeight=`calc(100dvh - ${height}px)`;
  };
  new ResizeObserver(reserveSpace).observe(bar);
  reserveSpace();
  const post = (type, fields={}) => {
    if (opener.closed) throw Error('Jobs has closed. Keep this drawing open and export an editable backup.');
    opener.postMessage({protocol,version,session,type,...fields},origin);
  };
  const note = (text, failed=false) => {
    status.textContent=text;
    status.style.color=failed?'#ffd2bd':'#fff';
  };
  const currentEnvelope = () => {
    syncFloor();
    return {format:'ZoneSketchByWill',version:1,project:recordCopy(state)};
  };
  const requireEditingCopy = () => {
    if(!loaded || currentProject!==loaded.editorProjectId)throw Error('Another Zone Sketch project is open. Return to the Jobs editing copy, or close this session and use Edit site again. This project has not been sent to Jobs.');
  };
  const textSize = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const fail = (message,requestId) => {
    note(message,true);
    try {post('error',{requestId,error:message});} catch {}
  };
  const pngPreviews = async project => {
    const previews=[];
    let total=0;
    for(const floor of project.floors) {
      const canvas=await renderModeFloorCanvas(floor,1200,'survey',1,project);
      try {
        const image=canvas.toDataURL('image/png');
        const bytes=Math.ceil(image.length*.75);
        if(bytes>8*1024*1024 || total+bytes>25*1024*1024) throw Error('Plan images are too large for this handoff. Export the editable backup; all drawing data remains saved in Zone Sketch.');
        total+=bytes;
        previews.push({floorId:floor.id,kind:'working',mode:'survey',revision:project.meta?.revision||'',image,width:canvas.width,height:canvas.height,renderer:'ZoneSketch',generatedAt:new Date().toISOString()});
      } finally {canvas.width=canvas.height=1;}
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    return previews;
  };
  const transmitPending = () => {
    requireEditingCopy();
    awaiting=true;
    save.disabled=true;
    note('Sending to Jobs… waiting for local-save confirmation.');
    clearTimeout(timeout);
    post('save',{requestId:pending.requestId,payload:pending.payload});
    timeout=setTimeout(()=>{
      awaiting=false;
      save.disabled=false;
      save.textContent='Retry save to Jobs';
      note('Jobs has not confirmed this save. Retry; your Zone Sketch copy is still saved.',true);
    },15000);
  };
  save.onclick=async()=>{
    if(!loaded||loading||awaiting)return;
    save.disabled=true;
    try {
      requireEditingCopy();
      // Retrying sends the identical request: Jobs can safely return its cached ACK.
      if(pending){transmitPending();return;}
      note('Saving drawing and preparing plan images…');
      if(typeof cbCheckpointDrag==='function')cbCheckpointDrag(true);
      if(!await saveNow())throw Error('Zone Sketch could not save locally. Keep the drawing open and use its editable backup.');
      requireEditingCopy();
      const project=currentEnvelope();
      validateProject(recordCopy(project));
      if(textSize(project)>32*1024*1024)throw Error('The editable project exceeds the 32 MiB handoff limit.');
      const snapshot=JSON.stringify(project);
      const previews=await pngPreviews(project.project);
      requireEditingCopy();
      pending={requestId:crypto.randomUUID(),payload:{project,previews},snapshot};
      transmitPending();
    }catch(error){awaiting=false;save.disabled=false;fail(error.message);}
  };
  back.onclick=()=>{
    if(loading||awaiting){note('Wait for the current transfer to finish before returning.',true);return;}
    if(loaded){
      const changed=JSON.stringify(currentEnvelope())!==lastAckSnapshot;
      if(changed&&!confirm('This drawing has changes not confirmed saved in Jobs. Return without sending them? Zone Sketch keeps its local copy.'))return;
    }
    try{post('cancel');opener.focus();}catch{}
    window.close();
  };
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(event.source!==opener||event.origin!==origin||!data||data.protocol!==protocol||data.version!==version||data.session!==session)return;
    if(data.type==='load'){
      if(loading)return;
      if(loaded){
        const same=['siteId','jobId','drawingId','jobRevision'].every(key=>data.payload?.[key]===loaded[key])&&JSON.stringify(data.payload?.project)===loaded.inputSnapshot;
        if(same)post('loaded');else fail('This editing session already contains another job. Open a new session.');
        return;
      }
      loading=true;
      try{
        const input=data.payload;
        const validId=value=>typeof value==='string'&&value.length>0&&value.length<10000;
        const validJob=input&&((input.jobId===null&&input.jobRevision===null)||(validId(input.jobId)&&Number.isSafeInteger(input.jobRevision)&&input.jobRevision>=1));
        if(!input||!['siteId','drawingId'].every(key=>validId(input[key]))||!validJob)throw Error('Jobs sent an invalid project identity.');
        if(textSize(input.project)>32*1024*1024)throw Error('The editable project exceeds 32 MiB.');
        const next=validateProject(recordCopy(input.project));
        if(!projectsReady||projectBusy)throw Error('Zone Sketch is busy. Wait for it to finish and retry from Jobs.');
        projectBusy=true;
        const copyId=uid();
        try{
          if(!await saveBeforeLeaving())throw Error('The current Zone Sketch drawing could not be saved. It has not been replaced.');
          await activateProject(copyId,next);
          projectDirty=true;
          if(!await saveNow())throw Error('Could not save this Jobs editing copy in Zone Sketch.');
          hideProjects();
        }finally{projectBusy=false;}
        loaded={siteId:input.siteId,jobId:input.jobId,drawingId:input.drawingId,jobRevision:input.jobRevision,inputSnapshot:JSON.stringify(input.project),editorProjectId:copyId};
        lastAckSnapshot=JSON.stringify(currentEnvelope());
        note('Editing a local copy for Jobs. Save to Jobs returns the drawing and plan images.');
        save.disabled=false;
        post('loaded');
      }catch(error){fail(error.message);}finally{loading=false;}
    }else if(data.type==='saved'&&pending&&data.requestId===pending.requestId){
      clearTimeout(timeout);
      lastAckSnapshot=pending.snapshot;
      pending=null;
      awaiting=false;
      save.disabled=false;
      save.textContent='Save to Jobs';
      if(currentProject!==loaded.editorProjectId){note('The Jobs editing copy was saved in Jobs. Another Zone Sketch project is now open; return to the editing copy before saving again.',true);return;}
      const more=JSON.stringify(currentEnvelope())!==lastAckSnapshot;
      note(more?'Saved in Jobs. Newer edits remain here; save again to send them.':'Saved in Jobs. The updated plans and assets are ready.');
    }else if(data.type==='error'&&(!data.requestId||data.requestId===pending?.requestId)){
      clearTimeout(timeout);
      awaiting=false;
      save.disabled=!loaded;
      if(pending)save.textContent='Retry save to Jobs';
      note(String(data.error||'Jobs could not save this revision. Retry or keep an editable backup.'),true);
    }
  });
  // The original load() function runs asynchronously. Announce only after its DB is ready.
  const readyTimer=setInterval(()=>{
    if(!projectsReady||restoringProject||$('homeImport').disabled)return;
    readySent=true;
    clearInterval(readyTimer);
    try{post('ready',{capabilities:['project-import','project-return','png-previews']});}catch(error){note(error.message,true);}
  },100);
  setTimeout(()=>{if(!readySent){clearInterval(readyTimer);note('Zone Sketch local storage is not ready. Reload to retry.',true);}},20000);
  window.addEventListener('beforeunload',()=>clearTimeout(timeout));
})();
