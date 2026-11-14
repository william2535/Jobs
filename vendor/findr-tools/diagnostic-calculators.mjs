// These calculators do arithmetic on supplied evidence. They do not authorise a
// test, establish a manufacturer's limit or turn an estimate into a diagnosis.
const blank=value=>value===null||value===undefined||typeof value==='string'&&!value.trim();
const r=value=>Number.parseFloat(Number(value).toPrecision(12));
const unitSets={
 voltage:{canonical:'V',units:{v:1,vdc:1,v_dc:1,'v dc':1,mv:0.001,mvdc:0.001,mv_dc:0.001,'mv dc':0.001}},
 current:{canonical:'A',units:{a:1,adc:1,a_dc:1,'a dc':1,ma:0.001,madc:0.001,'ma dc':0.001,ua:0.000001,'µa':0.000001,'μa':0.000001}},
 resistance:{canonical:'Ω',units:{'ω':1,ohm:1,ohms:1,r:1,'kω':1000,kohm:1000,kohms:1000,k:1000,'mω':1000000,mohm:1000000,mohms:1000000}},
 power:{canonical:'W',units:{w:1,watt:1,watts:1,mw:0.001,kw:1000}},
 capacity:{canonical:'Ah',units:{ah:1,'a h':1,mah:0.001,'ma h':0.001}},
 scalar:{canonical:'',units:{'':1,'%':1}},
};

/** Strictly parse a single quantity. OL is an observation, not infinity. */
export function parseDiagnosticQuantity(input,dimension,{defaultUnit}={}){
 const spec=unitSets[dimension];if(!spec)return {ok:false,raw:input,error:'Unknown quantity type.'};
 if(blank(input))return {ok:false,missing:true,raw:input,error:'A value is needed.'};
 if(!['number','string'].includes(typeof input))return {ok:false,raw:input,error:'Enter one numeric value and its unit.'};
 const raw=String(input),text=raw.trim().replace(/−/g,'-');
 if(dimension==='resistance'){
  const shorthand=text.match(/^([+]?(?:\d+))([RrKkM])(\d+)$/);
  if(shorthand){const scale=/r/i.test(shorthand[2])?1:/k/i.test(shorthand[2])?1000:1000000;return {ok:true,raw,value:r(Number(`${shorthand[1]}.${shorthand[3]}`)*scale),unit:'Ω',enteredUnit:shorthand[2]};}
 }
 const match=text.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-ZΩωµμ_%\s]*)$/);
 if(!match)return {ok:false,raw,error:'Enter one number with a supported unit; keep OL, unstable or unknown as an observation.'};
 const enteredUnit=match[2].trim()||defaultUnit||spec.canonical,key=enteredUnit.toLowerCase().replace(/\s+/g,' ');
 // SI m and M are different: never turn a milliohm into a megohm.
 const milliOhm=dimension==='resistance'&&enteredUnit[0]==='m'&&['ω','ohm','ohms'].includes(enteredUnit.slice(1).toLowerCase());
 const unsupportedMega=dimension!=='resistance'&&/^M(?:V|A|W|Ah|V_DC|A_DC|V DC|A DC)$/.test(enteredUnit);
 const scale=unsupportedMega?undefined:milliOhm?0.001:spec.units[key];
 if(scale===undefined)return {ok:false,raw,error:`Use a ${spec.canonical||'numeric'} value; “${enteredUnit}” is not a supported ${dimension} unit.`};
 const value=Number(match[1])*scale;
 if(!Number.isFinite(value))return {ok:false,raw,error:'The value must be finite.'};
 return {ok:true,raw,value:r(value),unit:spec.canonical,enteredUnit};
}
