import {newSite,createQuickJob,id} from "./model.js";
import {saveTimesheet} from "./timesheets.js";
export function exampleWorkspace(){
 const site=newSite("Example Site — Oakfield Business Centre","10 Example Road, Sampletown (fictional)");
 site.profile={version:1,client:"Oakfield Demo Ltd",contactName:"Example site manager",contactEmail:"manager@example.invalid",accessHours:"Monday–Friday, 08:00–17:00",accessProcedure:"Report to reception and sign in.",safetyRequirements:"Agree test arrangements with the site representative.",serviceRequirements:"Record defects and advise site manager."};
 const drawing=site.drawings[0];drawing.planPreviews=[];
 const specs=[["Fire","F01","Control panel","Reception"],["Fire","F02","Smoke detector","Ground floor corridor"],["Fire","F03","Manual call point","Main exit"],["Fire","F04","Sounder","Meeting room"],["CCTV","C01","IP camera","Car park"],["CCTV","C02","IP camera","Reception"],["CCTV","C03","Network video recorder","Comms room"],["Access control","A01","Door reader","Staff entrance"],["Access control","A02","Door contact","Staff entrance"]];
 const assets=specs.map(([discipline,reference,type,location])=>({id:id(),type,typeName:type,reference,location,manufacturer:"",model:"",description:"Demonstration equipment",floorId:drawing.floors[0].id,floorName:"Ground floor",x:null,y:null,photos:[],drawingStatus:"notRecorded",origin:"manual",discipline}));
 const jobs=[];
 for(const [discipline,workType,title,description,defect] of [
 ["Fire","Maintenance","EXAMPLE — Fire alarm maintenance","Routine inspection and functional testing. Example detector contamination identified; recommend cleaning or replacement.","Detector contamination indicated; further investigation required."],
 ["CCTV","Maintenance","EXAMPLE — CCTV maintenance","Checked live images, recording playback and camera condition. Example car park camera image obscured.","Car park camera requires cleaning."],
 ["Access control","Small works","EXAMPLE — Staff door remedial","Investigated intermittent door status. Example contact replaced and operation checked.",""]]){
 const visitDrawing=structuredClone(drawing);visitDrawing.id=id();visitDrawing.assets=assets.filter(a=>a.discipline===discipline).map(({discipline,...a})=>a);site.drawings.push(visitDrawing);
 const job=createQuickJob(site,{discipline,workType,title,description,system:discipline,engineer:"Demo engineer",scope:description,instructions:"Demonstration only — not actual work."});
 job.notesDocument={version:1,photos:[],blocks:[{id:id(),type:"heading1",runs:[{text:"Demonstration visit"}]},{id:id(),type:"paragraph",runs:[{text:description}]},{id:id(),type:"checklist",items:["Signed in and agreed scope","Inspected equipment","Recorded findings","Discussed follow-up with site representative"].map(text=>({id:id(),runs:[{text}],checked:true}))},{id:id(),type:"paragraph",runs:[{text:"Fictional example. Do not use as evidence of actual testing.",bold:true}]}]};
 job.results=job.results.map((result,i)=>({...result,state:defect&&i===1?"Unsatisfactory":"Satisfactory",observations:defect&&i===1?defect:"Example functional check satisfactory.",defects:defect&&i===1?defect:"",notes:"Illustrative result only."}));
 jobs.push(job);
 }
 let state={sites:[site],jobs};
 for(const job of jobs)state=saveTimesheet(state,{id:id(),date:"2026-01-12",start:"09:00",end:"10:30",endDate:"2026-01-12",sessionType:"Work",engineer:"Demo engineer",note:"Example visit only",hours:null},{jobId:job.id});
 return state;
}
