/** Jobs Toolbox adapts the FINDR form/rendering code from public/app/toolbox.mjs
 * and toolbox-pack.mjs at 8bdd8b03feb8babd6266b80b57dbc5d53efeadb2.
 * Original FINDR ownership, safety wording and source references are retained.
 * Calculator arithmetic and included illustrations remain in vendor/findr-tools;
 * this integration adds Jobs navigation, bundled assets and separate input storage.
 */
import {calculateToolbox,resistorBandOptions} from '../vendor/findr-tools/toolbox-calculators.mjs';
import {calculatePackTool} from '../vendor/findr-tools/toolbox-pack-calculators.mjs';
import packData from '../vendor/findr-tools/onsite-v1/pack.json' with {type:'json'};
import {renderToolboxExtra} from './toolbox-extras.js';
const guideImages={
 'ohms.svg':new URL('../vendor/findr-tools/onsite-v1/ohms.svg',import.meta.url).href,
 'resistors.svg':new URL('../vendor/findr-tools/onsite-v1/resistors.svg',import.meta.url).href,
 'dc-points.svg':new URL('../vendor/findr-tools/onsite-v1/dc-points.svg',import.meta.url).href,
 'camera-path.svg':new URL('../vendor/findr-tools/onsite-v1/camera-path.svg',import.meta.url).href,
 'poe-budget.svg':new URL('../vendor/findr-tools/onsite-v1/poe-budget.svg',import.meta.url).href,
 'relay.svg':new URL('../vendor/findr-tools/onsite-v1/relay.svg',import.meta.url).href,
};

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=value=>Array.isArray(value)?value:[];
const STORAGE_KEY='jobs:toolbox:v1';
const toolRows=[
 ['battery','battery-capacity','Fire alarm battery calculator','Standby and alarm capacity for 24 hours, 72 hours or your own duration.','battery'],
 ['voltage-drop','cable-voltage-drop','Voltage drop calculator','Estimate DC cable loss, percentage drop and voltage at the load.','bolt'],
 ['resistor','resistor-colours','Resistor colour code','Read 4, 5 or 6 bands, including tolerance and temperature coefficient.','resistor'],
 ['resistance','conductor-resistance','Conductor resistance & R1 + R2','Estimate line and protective-conductor resistance for a cable run.','ohm'],
];
const defaults={
 battery:{standbyCurrent:'',standbyCurrentUnit:'mA',alarmCurrent:'',alarmCurrentUnit:'mA',standbyHours:'24',alarmMinutes:'30',capacityFactor:'1',alarmCurrentMode:'total',selectedCapacity:'',maxCapacity:''},
 'voltage-drop':{supplyVoltage:'24',current:'',currentUnit:'A',lengthM:'',csaMm2:'1.5',temperatureC:'20',resistanceMode:'estimate',resistanceOhmPerKm:''},
 resistor:{bands:'4',colours:['brown','black','red','gold']},
 resistance:{lengthM:'',lineCsaMm2:'1.5',cpcCsaMm2:'1.5',temperatureC:'20',resistanceMode:'estimate',lineOhmPerKm:'',cpcOhmPerKm:''},
};
const palette={black:'#111111',brown:'#88502a',red:'#dc3939',orange:'#f28a24',yellow:'#f9dc46',green:'#3b9161',blue:'#397cca',violet:'#9763bd',grey:'#8d9299',white:'#f4f1e9',gold:'#c2a34b',silver:'#bec3ca',none:'transparent'};
const metricInfo={requiredAh:['Required capacity','Ah'],standbyAh:['Standby demand','Ah'],alarmAh:['Alarm demand','Ah'],baseAh:['Before capacity factor','Ah'],capacityFactor:['Capacity factor','×'],selectedAh:['Proposed capacity','Ah'],maxAh:['Documented maximum','Ah'],dropV:['Voltage drop','V'],dropPercent:['Percentage drop','%'],loadVoltageV:['Voltage at load','V DC'],loopResistanceOhm:['Outgoing + return resistance','Ω'],resistanceOhm:['Nominal resistance','Ω'],tolerancePercent:['Tolerance','%'],minimumOhm:['Minimum resistance','Ω'],maximumOhm:['Maximum resistance','Ω'],tempcoPpm:['Temperature coefficient','ppm/°C'],r1Ohm:['R1 · line conductor','Ω'],r2Ohm:['R2 · protective conductor','Ω'],r1PlusR2Ohm:['R1 + R2','Ω'],temperatureC:['Conductor temperature','°C']};
const visibleMetrics={battery:['requiredAh','standbyAh','alarmAh','baseAh','capacityFactor','selectedAh','maxAh'],'voltage-drop':['dropV','dropPercent','loadVoltageV','loopResistanceOhm'],resistor:['resistanceOhm','tolerancePercent','minimumOhm','maximumOhm','tempcoPpm'],resistance:['r1Ohm','r2Ohm','r1PlusR2Ohm','temperatureC']};
const readable=value=>String(value??'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const safeURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
function icon(type){
 const paths={battery:'<rect x="5" y="4" width="14" height="18" rx="3"/><path d="M9 4V2h6v2M9 10h6m-3-3v6M9 17h6"/>',bolt:'<path d="m14 2-9 12h6l-1 8 9-12h-6z"/>',resistor:'<path d="M1 12h4l2-5 3 10 4-10 3 10 2-5h4"/>',ohm:'<path d="M3 20h6v-3a7 7 0 1 1 6 0v3h6"/>'};
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[type]||paths.ohm}</svg>`;
}
const button=(action,label,extra='',style='secondary')=>`<button type="button" class="${style}" data-toolbox-action="${action}" ${extra}>${label}</button>`;

/** Calculator drafts are a separate convenience store, never diagnostic tests
 * or confirmed findings. No model, network request or job mutation is used. */
export function renderToolbox({onHome=()=>{},embedded=false}={}){
 const app=document.createElement('section');app.className='jobs-toolbox'+(embedded?' toolbox-embedded':'');
 const controller=new AbortController();let disposed=false,extraView=null;
 const listen=(type,callback)=>app.addEventListener(type,callback,{signal:controller.signal});
 let selected='',drafts=structuredClone(defaults),result=null,storageWarning='',loaded=false,draftsUnsaved=false;
 let packDrafts=Object.fromEntries(packData.tools.map(tool=>[tool.id,Object.fromEntries(tool.fields.map(field=>[field.key,String(field.default??'')]))]));
 const find=selector=>app.querySelector(selector);
 function load(){
  if(loaded)return;loaded=true;
  try{
   const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
   if(saved&&saved.schemaVersion!==1){storageWarning='Saved Toolbox inputs use an unsupported version. Calculations remain available.';return;}
   for(const slug of Object.keys(defaults)){
    const row=saved?.drafts?.[slug];if(!row||typeof row!=='object')continue;
    for(const name of Object.keys(defaults[slug])){
     const value=row[name];
     if(name==='colours'&&Array.isArray(value)&&value.length<=6&&value.every(value=>typeof value==='string'&&Object.hasOwn(palette,value)))drafts[slug][name]=value;
     else if(typeof value==='string'&&value.length<=80)drafts[slug][name]=value;
    }
   }
   for(const tool of packData.tools)for(const field of tool.fields){const value=saved?.packDrafts?.[tool.id]?.[field.key];if(typeof value==='string'&&value.length<=80)packDrafts[tool.id][field.key]=value;}
  }catch{storageWarning='Calculations still work, but saved calculator inputs could not be read.';}
  if(!['4','5','6'].includes(drafts.resistor.bands))drafts.resistor=structuredClone(defaults.resistor);
  const bands=Number(drafts.resistor.bands),seed=({4:['brown','black','red','gold'],5:['brown','black','black','brown','brown'],6:['brown','black','black','brown','brown','brown']})[bands];
  drafts.resistor.colours=Array.from({length:bands},(_,index)=>resistorBandOptions(bands,index).some(option=>option.value===drafts.resistor.colours[index])?drafts.resistor.colours[index]:seed[index]);
  for(const slug of ['voltage-drop','resistance'])if(!['estimate','manufacturer'].includes(drafts[slug].resistanceMode))drafts[slug].resistanceMode='estimate';
  if(!['total','additional'].includes(drafts.battery.alarmCurrentMode))drafts.battery.alarmCurrentMode='total';
  for(const slug of ['battery','voltage-drop'])for(const name of Object.keys(drafts[slug]))if(name.endsWith('Unit')&&!['A','mA'].includes(drafts[slug][name]))drafts[slug][name]=defaults[slug][name];
 }
 function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify({schemaVersion:1,drafts,packDrafts}));storageWarning='';draftsUnsaved=false;}catch{draftsUnsaved=true;storageWarning='Calculations still work, but these inputs could not be saved on this device.';}const el=find('#toolbox-save-status');if(el){el.textContent=storageWarning||'Inputs kept on this device · separate from job results';el.classList.toggle('toolbox-storage-warning',!!storageWarning);el.setAttribute('role',storageWarning?'alert':'status');}}
 function field(name,label,{hint='',step='any',min,required=true}={}){
  const value=drafts[selected][name]??'',id='toolbox-'+name;
  return `<label class="toolbox-field" for="${id}"><span>${esc(label)}</span><input id="${id}" name="${esc(name)}" type="number" inputmode="decimal" step="${step}" ${min===undefined?'':`min="${min}"`} value="${esc(value)}" ${required?'required':''} aria-describedby="${id}-hint ${id}-error">${hint?`<small id="${id}-hint">${esc(hint)}</small>`:`<span id="${id}-hint" hidden></span>`}<small class="toolbox-field-error" id="${id}-error"></small></label>`;
 }
 function select(name,label,options,{hint=''}={}){
  const id='toolbox-'+name,value=drafts[selected][name];
  return `<label class="toolbox-field" for="${id}"><span>${esc(label)}</span><select id="${id}" name="${name}">${options.map(([key,label])=>`<option value="${esc(key)}"${String(value)===String(key)?' selected':''}>${esc(label)}</option>`).join('')}</select>${hint?`<small>${esc(hint)}</small>`:''}<small class="toolbox-field-error" id="${id}-error"></small></label>`;
 }
 function current(name,label){
  const d=drafts[selected],id='toolbox-'+name,unit=name+'Unit';
  return `<div class="toolbox-field"><label for="${id}">${esc(label)}</label><div class="toolbox-current"><input id="${id}" name="${name}" type="number" inputmode="decimal" step="any" min="0" required value="${esc(d[name])}" aria-describedby="${id}-error"><select name="${unit}" aria-label="${esc(label)} unit">${['mA','A'].map(u=>`<option${d[unit]===u?' selected':''}>${u}</option>`).join('')}</select></div><small class="toolbox-field-error" id="${id}-error"></small></div>`;
 }
 function batteryForm(){return `<div class="toolbox-preset"><span>Standby time</span>${['24','72'].map(hours=>button('standby',hours+' hours',`data-hours="${hours}" aria-pressed="${drafts.battery.standbyHours===hours}"`)).join('')}</div><div class="toolbox-fields">${current('standbyCurrent','Standby current')}${current('alarmCurrent','Alarm current')}${field('standbyHours','Standby duration (hours)',{min:0,hint:'Change this for a custom period.'})}${field('alarmMinutes','Alarm duration (minutes)',{min:0})}${select('alarmCurrentMode','What does the alarm reading include?',[['total','Total current in alarm'],['additional','Extra current above standby']])}${field('capacityFactor','Capacity factor',{min:1,hint:'1 = no allowance. Set any required design margin explicitly.'})}</div><p class="toolbox-note">Use the system’s documented loads, durations and battery allowances. A 24-hour or 72-hour preset does not establish compliance.</p><details class="toolbox-more"><summary>Battery and charger limits (optional)</summary><div class="toolbox-fields">${field('selectedCapacity','Proposed battery capacity (Ah)',{required:false,min:0})}${field('maxCapacity','Documented maximum capacity (Ah)',{required:false,min:0,hint:'Use the exact panel / charger manual.'})}</div><p class="small">Two equal batteries in series increase voltage, not Ah capacity. This estimate does not verify charge recovery time or battery condition.</p></details>`;}
 function resistanceSource(kind){
  const manual=drafts[selected].resistanceMode==='manufacturer';
  const inputs=kind==='cable'?field('resistanceOhmPerKm','One conductor resistance at 20°C (Ω/km)',{min:0,hint:'Use the cable manufacturer’s documented value.'}):field('lineOhmPerKm','Line resistance at 20°C (Ω/km)',{min:0})+field('cpcOhmPerKm','CPC resistance at 20°C (Ω/km)',{min:0});
  return `${select('resistanceMode','Resistance source',[['estimate','Copper cross-section estimate'],['manufacturer','Documented copper resistance at 20°C']])}<div class="toolbox-fields toolbox-manufacturer" ${manual?'':'hidden'}>${inputs}</div>`;
 }
 function voltageForm(){return `<div class="toolbox-fields">${field('supplyVoltage','Supply voltage (V DC)',{min:0})}${current('current','Load current')}${field('lengthM','One-way cable length (m)',{min:0,hint:'The return conductor is included automatically.'})}<div class="toolbox-estimate" ${drafts[selected].resistanceMode==='estimate'?'':'hidden'}>${field('csaMm2','Each conductor cross-section (mm²)',{min:0})}</div>${field('temperatureC','Conductor temperature (°C)')}${resistanceSource('cable')}</div><p class="toolbox-note">A DC, two-wire copper circuit with equal outgoing and return conductors. Compare the result with the actual device’s operating range; this is not an AC or distributed-load design calculation.</p>`;}
 function conductorForm(){return `<div class="toolbox-fields">${field('lengthM','One-way circuit length (m)',{min:0,hint:'Each conductor uses this length.'})}${field('temperatureC','Conductor temperature (°C)')}<div class="toolbox-estimate" ${drafts[selected].resistanceMode==='estimate'?'':'hidden'}>${field('lineCsaMm2','Line conductor cross-section (mm²)',{min:0})}</div><div class="toolbox-estimate" ${drafts[selected].resistanceMode==='estimate'?'':'hidden'}>${field('cpcCsaMm2','CPC cross-section (mm²)',{min:0})}</div>${resistanceSource('conductor')}</div><p class="toolbox-note">R1 is the line conductor; R2 is the circuit protective conductor (CPC). This is a copper resistance estimate, not a measured continuity result, earth-fault loop impedance (Zs), or a compliance decision.</p>`;}
 function colourOptions(bands,index){return list(resistorBandOptions(bands,index)).map(value=>typeof value==='string'?[value,readable(value)]:[value.id||value.value||value.name,value.label||readable(value.id||value.value||value.name)]);}
 function resistorPreview(){const colours=drafts.resistor.colours.slice(0,Number(drafts.resistor.bands));return `<div class="toolbox-resistor-preview" role="img" aria-label="${esc('Resistor bands: '+colours.map(readable).join(', '))}"><span class="toolbox-wire"></span><div class="toolbox-resistor-body">${colours.map((colour,index)=>`<span class="toolbox-band${index===colours.length-(colours.length===6?2:1)?' toolbox-tolerance-band':''}" style="--band-colour:${palette[colour]||'transparent'}"></span>`).join('')}</div><span class="toolbox-wire"></span></div>`;}
 function resistorForm(){
  const bands=Number(drafts.resistor.bands),roles=Array.from({length:bands},(_,i)=>i<(bands===4?2:3)?'Digit '+(i+1):i===(bands===4?2:3)?'Multiplier':i===bands-1&&bands===6?'Temperature coefficient':'Tolerance');
  return `${select('bands','Number of bands',[['4','4 bands'],['5','5 bands'],['6','6 bands']])}<div id="toolbox-resistor-visual">${resistorPreview()}</div><p class="toolbox-note">Set each colour to match the resistor, reading from the digit end. Do not rely on the example colours below.</p><div class="toolbox-colours">${roles.map((role,index)=>`<label class="toolbox-field" for="toolbox-band-${index}"><span>${index+1}. ${esc(role)}</span><select id="toolbox-band-${index}" data-toolbox-band="${index}" aria-describedby="toolbox-colours-error">${colourOptions(bands,index).map(([key,label])=>`<option value="${esc(key)}"${drafts.resistor.colours[index]===key?' selected':''}>${esc(label)}</option>`).join('')}</select></label>`).join('')}</div><small class="toolbox-field-error" id="toolbox-colours-error"></small>`;
 }
 function saveStatus(){return `<p id="toolbox-save-status" class="toolbox-footnote${storageWarning?' toolbox-storage-warning':''}" role="${storageWarning?'alert':'status'}">${esc(storageWarning||'Inputs kept on this device · separate from job results')}</p>`;}
 function pageFrame(title,description,content,type=''){
  return `<section class="toolbox-page"><nav class="toolbox-top" aria-label="Toolbox navigation">${button('back','‹ Toolbox')}${embedded?'':button('home','Home')}</nav><div class="toolbox-heading">${type?`<span class="toolbox-icon">${icon(type)}</span>`:''}<h1>${esc(title)}</h1></div>${description?`<p class="toolbox-lead">${esc(description)}</p>`:''}${content}<p class="toolbox-attribution">FINDR calculations and original guides · included in Jobs</p></section>`;
 }
 function toolCard(slug,title,description,type='ohm'){
  return `<button type="button" class="toolbox-card" data-toolbox-open="${esc(slug)}" aria-label="${esc(title)}"><span class="toolbox-icon">${icon(type)}</span><strong>${esc(title)}</strong><span class="toolbox-card-description">${esc(description)}</span></button>`;
 }
 function landing(){
  return `<section class="toolbox-page"><nav class="toolbox-top" aria-label="Toolbox navigation">${embedded?'':button('home','‹ Home')}</nav><div class="toolbox-heading"><h1>Toolbox</h1><span class="toolbox-included">Included offline</span></div><p class="toolbox-lead">Quick calculations, picture guides and training tools for the job in front of you.</p><h2 class="toolbox-section-title">Core tools</h2><div class="toolbox-grid">${toolRows.map(([slug,,title,description,type])=>toolCard(slug,title,description,type)).join('')}</div><h2 class="toolbox-section-title">On-site calculators</h2><div class="toolbox-grid">${packData.tools.map(tool=>toolCard('pack:'+tool.id,tool.title,tool.description,tool.id.includes('resistor')?'resistor':'bolt')).join('')}</div><h2 class="toolbox-section-title">More tools</h2><div class="toolbox-grid">${toolCard('extra:resistor-lab','Resistor lab','Find resistor combinations for a target, or build a series/parallel circuit.','resistor')}${toolCard('extra:fess','FESS quick mocks','Practice questions, explanations, mock tests and full papers.','ohm')}</div><h2 class="toolbox-section-title">Picture guides</h2><div class="toolbox-grid toolbox-guide-grid">${packData.guides.map(guide=>`<button type="button" class="toolbox-card toolbox-guide-card" data-toolbox-open="guide:${esc(guide.id)}" aria-label="${esc(guide.title)}"><img src="${esc(guideImages[guide.image])}" alt="${esc(guide.alt)}" loading="lazy"><strong>${esc(guide.title)}</strong></button>`).join('')}</div>${saveStatus()}<p class="toolbox-footnote">Use the actual equipment and cable documentation for required limits. Calculator results are separate from engineer-confirmed job records.</p><p class="toolbox-attribution">${esc(packData.license)}</p></section>`;
 }
 function packSources(ids){
  return `<details class="toolbox-more"><summary>Sources & assumptions</summary><ul>${ids.map(id=>packData.sources[id]).filter(Boolean).map(source=>{const url=safeURL(source.url);return `<li>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a>`:esc(source.title)}</li>`;}).join('')}</ul><p>Reference links need a connection. The calculation and original picture are included locally. Source review: ${esc(packData.checkedAt)}. These aids do not establish compliance or replace the equipment’s instructions.</p></details>`;
 }
 function packToolForm(tool){
  return `<form id="toolbox-pack-form" data-tool="${esc(tool.id)}" class="toolbox-form" novalidate><div class="toolbox-fields">${tool.fields.map(field=>`<label class="toolbox-field" for="toolbox-pack-${esc(field.key)}"><span>${esc(field.label)}</span><input id="toolbox-pack-${esc(field.key)}" type="number" name="${esc(field.key)}" aria-label="${esc(field.label)}" value="${esc(packDrafts[tool.id][field.key])}" inputmode="decimal" min="0" step="any"${field.max?` max="${esc(field.max)}"`:''} required aria-describedby="toolbox-pack-${esc(field.key)}-error"><small class="toolbox-field-error" id="toolbox-pack-${esc(field.key)}-error" data-pack-field-error="${esc(field.key)}"></small></label>`).join('')}</div><div id="toolbox-error-summary" class="toolbox-error-summary" role="alert" hidden></div><div class="toolbox-actions"><button class="primary" type="submit">Calculate</button>${button('pack-reset','Reset')}</div><p class="toolbox-formula">${esc(tool.formula)}</p>${saveStatus()}</form><section id="toolbox-pack-result" class="toolbox-result" hidden tabindex="-1" aria-live="polite"></section>${packSources(tool.sources)}`;
 }
 function guidePage(guide){
  return `<figure class="toolbox-guide-picture"><div class="toolbox-picture-scroll"><img src="${esc(guideImages[guide.image])}" alt="${esc(guide.alt)}"></div><figcaption>${button('picture-zoom','Zoom picture','aria-pressed="false"')}<span>Pan the enlarged picture to inspect it.</span></figcaption></figure><p>${esc(guide.alt)}</p>${guide.notes.map(note=>`<p class="toolbox-note">${esc(note)}</p>`).join('')}${packSources(guide.sources)}`;
 }
 function collectPack(form){
  const values=packDrafts[form.dataset.tool];if(!values)return;
  for(const input of form.querySelectorAll('input[name]'))if(Object.hasOwn(values,input.name))values[input.name]=String(input.value).slice(0,80);
 }
 function clearPackResult(){
  const output=find('#toolbox-pack-result');if(output){output.hidden=true;output.replaceChildren();}
  const summary=find('#toolbox-error-summary');if(summary){summary.hidden=true;summary.textContent='';}
  for(const input of app.querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');
  for(const error of app.querySelectorAll('[data-pack-field-error]'))error.textContent='';
 }
 function calculatePack(form){
  collectPack(form);save();clearPackResult();
  const calculated=calculatePackTool(form.dataset.tool,packDrafts[form.dataset.tool]);
  if(calculated.status!=='calculated'){
   for(const [key,message]of Object.entries(calculated.errors||{})){const field=form.elements.namedItem(key);field?.setAttribute('aria-invalid','true');const error=[...form.querySelectorAll('[data-pack-field-error]')].find(element=>element.dataset.packFieldError===key);if(error)error.textContent=message;}
   const summary=find('#toolbox-error-summary');summary.hidden=false;summary.textContent=Object.values(calculated.errors||{}).join(' ')||'Check the highlighted values before calculating.';
   form.querySelector('[aria-invalid="true"]')?.focus();return;
  }
  const output=find('#toolbox-pack-result');output.hidden=false;
  output.innerHTML=`<h2>Calculated estimate</h2><dl class="toolbox-values">${calculated.results.map(([label,value,unit])=>`<div><dt>${esc(label)}</dt><dd>${esc(new Intl.NumberFormat('en-GB',{maximumSignificantDigits:8}).format(value))} <span>${esc(unit)}</span></dd></div>`).join('')}</dl>${calculated.notes.map(note=>`<p class="toolbox-note">${esc(note)}</p>`).join('')}`;
  output.focus({preventScroll:true});output.scrollIntoView?.({block:'nearest'});
 }
 const notifyView=()=>app.dispatchEvent(new CustomEvent('toolboxviewchange',{bubbles:true}));
 function render(slug=''){
  const before=selected;paint(slug);
  if(before!==selected&&!selected.startsWith('extra:'))notifyView();
 }
 function paint(slug=''){
  if(disposed)return;
  if(extraView){if(extraView.confirmLeave?.()===false)return;extraView.dispose?.();extraView=null;}
  app.dataset.toolboxView=slug?'tool':'landing';
  if(slug==='extra:resistor-lab'||slug==='extra:fess'){
   selected=slug;app.replaceChildren();extraView=renderToolboxExtra(slug.slice(6),{onBack:()=>render(),onNavigate:notifyView});app.append(extraView);return;
  }
  load();selected=slug;result=null;
  if(slug.startsWith('pack:')){const tool=packData.tools.find(tool=>tool.id===slug.slice(5));if(tool){app.innerHTML=pageFrame(tool.title,tool.description,packToolForm(tool));return;}}
  if(slug.startsWith('guide:')){const guide=packData.guides.find(guide=>guide.id===slug.slice(6));if(guide){app.innerHTML=pageFrame(guide.title,'',guidePage(guide));return;}}
  selected=toolRows.some(row=>row[0]===slug)?slug:'';
  if(!selected){app.innerHTML=landing();return;}
  const [,,title,description,type]=toolRows.find(row=>row[0]===selected);
  app.innerHTML=pageFrame(title,description,`<form id="toolbox-form" class="toolbox-form" novalidate>${({battery:batteryForm,'voltage-drop':voltageForm,resistor:resistorForm,resistance:conductorForm}[selected])()}<div id="toolbox-error-summary" class="toolbox-error-summary" role="alert" hidden></div><div class="toolbox-actions"><button type="submit" class="primary">Calculate</button>${button('reset','Reset')}</div>${saveStatus()}</form><section id="toolbox-result" class="toolbox-result" aria-live="polite" tabindex="-1" hidden></section>`,type);
 }
 function collect(){
  const form=find('#toolbox-form');if(!form||!selected)return;
  const d=drafts[selected];for(const element of form.elements){if(element.name&&Object.hasOwn(d,element.name))d[element.name]=String(element.value).slice(0,80);}
  for(const element of form.querySelectorAll('[data-toolbox-band]'))d.colours[Number(element.dataset.toolboxBand)]=element.value;
 }
 function inputs(){const d=structuredClone(drafts[selected]);for(const key of ['standbyCurrent','alarmCurrent','current'])if(Object.hasOwn(d,key))d[key]=d[key].trim()?d[key]+' '+d[key+'Unit']:'';if(selected==='resistor'){d.bands=Number(d.bands);d.colours=d.colours.slice(0,d.bands);}return d;}
 function clearResult(){result=null;const output=find('#toolbox-result');if(output){output.hidden=true;output.innerHTML='';}const summary=find('#toolbox-error-summary');if(summary){summary.hidden=true;summary.textContent='';}for(const el of app.querySelectorAll('.toolbox-field-error'))el.textContent='';for(const el of app.querySelectorAll('[aria-invalid]'))el.removeAttribute('aria-invalid');}
 function resultMarkup(value){
  const values=list(visibleMetrics[selected]).filter(name=>Number.isFinite(value.values?.[name])).map(name=>{const v=value.values[name],[label,unit]=metricInfo[name],formatted=new Intl.NumberFormat('en-GB',{maximumSignificantDigits:6}).format(v);return `<div><dt>${esc(label)}</dt><dd>${name==='tolerancePercent'?'± ':''}${esc(formatted)} <span>${esc(unit)}</span></dd></div>`;}).join('');
  const sources=list(value.sourceRefs).map(ref=>{const url=safeURL(ref.url||ref.sourceUrl);return `<li>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(ref.title||'Reference')} ↗</a>`:esc(ref.title||'Reference')}${[ref.section,ref.revision,Number.isInteger(ref.pdfPage)?'PDF page '+ref.pdfPage:''].filter(Boolean).map(part=>'<span> · '+esc(part)+'</span>').join('')}${ref.note?`<p>${esc(ref.note)}</p>`:''}</li>`;}).join('');
  return `<div class="eyebrow">CALCULATED RESULT</div><h2>${esc(value.summary||'Your calculation')}</h2>${values?`<dl class="toolbox-values">${values}</dl>`:''}${list(value.warnings).length?`<div class="toolbox-result-notes">${value.warnings.map(note=>`<p>${esc(note)}</p>`).join('')}</div>`:''}<details class="toolbox-more"><summary>Formula, assumptions & references</summary>${list(value.formulas).map(formula=>`<p class="toolbox-formula">${esc(typeof formula==='string'?formula:formula.text||formula.formula)}</p>`).join('')}${list(value.assumptions).length?`<ul>${value.assumptions.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`:''}${sources?`<ul class="toolbox-sources">${sources}</ul><small>Reference links require a connection; the calculation itself works offline.</small>`:''}</details>`;
 }
 function calculate(){
  collect();save();clearResult();const row=toolRows.find(row=>row[0]===selected);if(!row)return;
  result=calculateToolbox(row[1],inputs());
  if(result.status!=='calculated'){
   const errors=Object.entries(result.errors||{});for(const [name,message]of errors){const band=/^colour(\d+)$/.exec(name),input=find(band?'#toolbox-band-'+band[1]:'#toolbox-'+name),error=find(band?'#toolbox-colours-error':'#toolbox-'+name+'-error');if(input)input.setAttribute('aria-invalid','true');if(error)error.textContent=message;}
   const summary=find('#toolbox-error-summary');summary.hidden=false;summary.textContent=errors.length?errors.map(([,message])=>message).join(' '):result.summary||'Check the inputs before calculating.';
   const first=app.querySelector('[aria-invalid="true"]');if(first?.closest('details'))first.closest('details').open=true;first?.focus();return;
  }
  const output=find('#toolbox-result');output.hidden=false;output.innerHTML=resultMarkup(result);output.focus({preventScroll:true});output.scrollIntoView?.({block:'nearest',behavior:'auto'});
 }
 listen('submit',event=>{if(event.target.id==='toolbox-pack-form'){event.preventDefault();calculatePack(event.target);return;}if(event.target.id!=='toolbox-form')return;event.preventDefault();calculate();});
 listen('input',event=>{const packForm=event.target.closest('#toolbox-pack-form');if(packForm){collectPack(packForm);save();clearPackResult();return;}if(!event.target.closest('#toolbox-form'))return;collect();save();clearResult();});
 listen('change',event=>{
  const packForm=event.target.closest('#toolbox-pack-form');if(packForm){collectPack(packForm);save();clearPackResult();return;}
  if(!event.target.closest('#toolbox-form'))return;collect();
  if(event.target.name==='bands'){const count=Number(drafts.resistor.bands);drafts.resistor.colours=({4:['brown','black','red','gold'],5:['brown','black','black','brown','brown'],6:['brown','black','black','brown','brown','brown']})[count]||defaults.resistor.colours;save();render(selected);return;}
  if(event.target.name==='resistanceMode'){save();render(selected);return;}
  if(event.target.hasAttribute('data-toolbox-band')){const target=find('#toolbox-resistor-visual');if(target)target.innerHTML=resistorPreview();}
  save();clearResult();
 });
 listen('click',event=>{
  const card=event.target.closest('[data-toolbox-open]');if(card){render(card.dataset.toolboxOpen);return;}
  const target=event.target.closest('[data-toolbox-action]');if(!target||!target.closest('.toolbox-page'))return;
  if(target.dataset.toolboxAction==='home'){onHome();return;}
  if(target.dataset.toolboxAction==='back'){render();return;}
  if(target.dataset.toolboxAction==='picture-zoom'){const picture=app.querySelector('.toolbox-picture-scroll'),expanded=picture.classList.toggle('toolbox-picture-expanded');target.setAttribute('aria-pressed',String(expanded));target.textContent=expanded?'Fit picture':'Zoom picture';return;}
  if(target.dataset.toolboxAction==='pack-reset'){const tool=packData.tools.find(tool=>selected==='pack:'+tool.id);if(tool){packDrafts[tool.id]=Object.fromEntries(tool.fields.map(field=>[field.key,String(field.default??'')]));save();render(selected);}return;}
  if(target.dataset.toolboxAction==='standby'){collect();drafts.battery.standbyHours=target.dataset.hours;save();render(selected);}
  if(target.dataset.toolboxAction==='reset'){drafts[selected]=structuredClone(defaults[selected]);save();render(selected);const status=find('#toolbox-save-status');if(status&&!storageWarning)status.textContent=selected==='resistor'?'Example colours restored. Set each band to match your resistor.':'Inputs reset. Enter the values for this circuit.';}
 });
 render();
 app.hasUnsavedChanges=()=>draftsUnsaved||extraView?.hasUnsavedChanges?.()===true;
 app.confirmLeave=()=>{if(extraView?.confirmLeave?.()===false)return false;if(draftsUnsaved&&!confirm('Calculator inputs could not be saved on this device. Leave and discard these unsaved changes?'))return false;draftsUnsaved=false;return true;};
 app.dispose=()=>{if(disposed)return;disposed=true;controller.abort();extraView?.dispose?.();extraView=null;};
 return app;
}
