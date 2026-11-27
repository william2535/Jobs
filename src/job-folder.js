let directory = null;
export function folderName(){return directory?.name || '';}
export async function chooseJobFolder(){
  if(typeof window.showDirectoryPicker==='function'){
    directory=await window.showDirectoryPicker({mode:'readwrite'});
    const files=[];
    for await(const entry of directory.values()) if(entry.kind==='file' && /\.jobs\.json$/i.test(entry.name)) files.push(await entry.getFile());
    return {name:directory.name,files,writable:true};
  }
  return new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.multiple=true;input.setAttribute('webkitdirectory','');input.style.display='none';
    const finish=result=>{input.remove();resolve(result);};
    input.oncancel=()=>finish(null);
    input.onchange=()=>{const all=[...input.files];finish({name:all[0]?.webkitRelativePath?.split('/')[0] || 'Selected folder',files:all.filter(file=>/\.jobs\.json$/i.test(file.name)),writable:false});};
    document.body.append(input);input.click();
  });
}
export async function saveToJobFolder(data,name){
  if(!directory || !/\.jobs\.json$/i.test(name))return false;
  if(await directory.queryPermission({mode:'readwrite'})!=='granted')return false;
  const handle=await directory.getFileHandle(name,{create:true});
  const writer=await handle.createWritable();
  try{await writer.write(JSON.stringify(data));await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}
  return true;
}
export function sortJobs(jobs,sites){
  const label=j=>sites.find(s=>s.id===j.siteId)?.name || j.workflow?.details?.title || j.title || 'Untitled job';
  return [...jobs].sort((a,b)=>label(a).localeCompare(label(b),undefined,{numeric:true,sensitivity:'base'}));
}
