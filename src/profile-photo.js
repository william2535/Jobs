export function validProfilePhoto(value) {
  return typeof value === 'string' && value.length <= 350000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export function validateProfilePhoto(value) {
  if (value != null && !validProfilePhoto(value)) throw Error('Invalid profile picture.');
}
export function profilePhoto(job, site) { return site ? site.profilePhoto : job?.profilePhoto; }
export function photoMarkup(value) {
  return validProfilePhoto(value) ? '<img class="record-profile-photo" alt="" src="' + value + '">' : '';
}
export async function compressProfilePhoto(file) {
  if (!file || !/^image\//.test(file.type) || file.size > 25 * 1024 * 1024) throw Error('Choose an image under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This image could not be opened. Try JPEG or PNG.'));image.src=url;});
    const size=Math.min(image.naturalWidth,image.naturalHeight);
    if (!size) throw Error('Empty image.');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=384;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,384,384);
    ctx.drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,384,384);
    const value=canvas.toDataURL('image/jpeg',.8);validateProfilePhoto(value);return value;
  } finally { URL.revokeObjectURL(url); }
}
export function photoPicker({value, onChange, onError=error=>alert(error.message), onBusy=()=>{}}) {
  const root=document.createElement('div');root.className='record-photo-picker';
  const input=document.createElement('input');input.type='file';input.accept='image/*';input.hidden=true;
  const add=document.createElement('button');add.type='button';add.className='record-photo-add';
  const remove=document.createElement('button');remove.type='button';remove.textContent='Remove photo';remove.className='record-photo-remove';
  const preview=document.createElement('span');preview.className='record-photo-preview';
  function paint(){preview.innerHTML=photoMarkup(value);preview.hidden=!validProfilePhoto(value);add.textContent=value?'Replace photo':'＋ Add photo';remove.hidden=!value;}
  add.onclick=()=>input.click();
  input.onchange=async()=>{const file=input.files[0];input.value='';if(!file)return;add.disabled=remove.disabled=true;onBusy(true);try{const next=await compressProfilePhoto(file);if(!root.isConnected)return;if(await onChange(next)!==false){value=next;paint();}}catch(error){onError(error);}finally{add.disabled=remove.disabled=false;onBusy(false);}};
  remove.onclick=async()=>{if(await onChange(null)!==false){value=null;paint();}};
  root.append(preview,add,remove,input);paint();return root;
}
