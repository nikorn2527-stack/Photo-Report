const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','Portal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/<\?!=[\s\S]*?\?>/g,'"dashboard"');
function page(){const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',hidden:false,disabled:false,focus(){},classList:{toggle(){}},querySelectorAll(){return []}});return elements.get(id)},querySelectorAll(){return []}};const context=vm.createContext({document,window:{addEventListener(){},setTimeout,clearTimeout}});new vm.Script(script).runInContext(context);return {context,document};}
const rows=Array.from({length:5},(_,i)=>({jobNo:'JOB-'+(i+1),department:i%2?' การเงิน ':'การเงิน',floor:String(i+1),installStatus:'ติดตั้งเสร็จ'})).concat([{jobNo:'JOB-6',department:'เภสัช',installStatus:'ติดตั้งเสร็จ'},{jobNo:'JOB-7',department:'เภสัช',installStatus:'รอดำเนินการ'},{jobNo:'JOB-8',installStatus:'ติดตั้งเสร็จ'}]);
function api(p,handler){p.context.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return {getExecutivePhotoImage(job){handler({method:'photo',job,type:'after1',success,failure})}}}}}}}}}
const tick=()=>new Promise(r=>setImmediate(r));
test('completed computers group by department across floors and paginate four jobs per page',()=>{
 const {context}=page(),before=JSON.stringify(rows),pages=context.buildExecutivePhotoPlan(rows.concat([rows[0],{department:'การเงิน',jobNo:''}]));
 assert.equal(pages.length,4);const finance=pages.filter(r=>r.department==='การเงิน');assert.equal(finance.length,2);assert.equal(finance[0].departmentJobs,5);assert.deepEqual(Array.from(finance[0].jobs,r=>r.jobNo),['JOB-1','JOB-2','JOB-3','JOB-4']);assert.equal(finance[1].jobs[0].jobNo,'JOB-5');assert.ok(!pages.some(p=>p.jobs.some(r=>r.jobNo==='JOB-7')));assert.equal(JSON.stringify(rows),before);
});
test('executive cards show the full computer independently of individual-job crop settings and escape labels',()=>{
 const {context}=page();vm.runInContext("workPhotoAdjustments.set('JOB-1::after1',{zoom:3,x:10,y:5});workPhotoAdjustments.set('JOB-2::after1',{zoom:7})",context);
 const html=context.executivePhotoJobHtml({jobNo:'JOB-1',room:'<img>'},'original-after1');assert.ok(!html.includes('transform:'));assert.ok(!html.includes('scale('));assert.ok(html.includes('&lt;img&gt;'));assert.ok(html.includes('JOB-1 หลังติดตั้ง 1'));assert.equal((html.match(/<img /g)||[]).length,1);
});
test('report snapshots the selected unit, loads only after1 and waits for both originals before enabling print',async()=>{
 const p=page(),requests=[];p.context.rows=rows.slice(0,2);vm.runInContext("portalData={assetRows:rows,loadedAt:'2026-10-22T00:00:00Z'};dashboardDepartment='การเงิน'",p.context);api(p,r=>{requests.push(r);});p.context.openExecutivePhotoReport();await tick();assert.equal(requests.length,2);const photos=requests.filter(r=>r.method==='photo');assert.ok(photos.every(r=>r.type==='after1'));assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);
 photos[0].success('original-one');await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);photos[1].success('original-two');await tick();await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.ok(p.document.getElementById('executivePhotoJob0').innerHTML.includes('original-one'));assert.ok(p.document.getElementById('executivePhotoStatus').textContent.includes('2 เครื่อง · 2 รูป'));
});
test('missing after1 never substitutes stickers, UPS or before photos, and identifies the job for review',async()=>{
 const p=page(),requests=[];p.context.rows=[rows[0]];vm.runInContext("portalData={assetRows:rows,loadedAt:'2026-10-22T00:00:00Z'}",p.context);api(p,r=>{requests.push(r);r.success('')});p.context.openExecutivePhotoReport();await tick();assert.equal(requests.length,1);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.ok(p.document.getElementById('executivePhotoJob0').innerHTML.includes('ยังไม่มีภาพหลังติดตั้ง 1'));assert.ok(p.document.getElementById('executivePhotoStatus').textContent.includes('ยังไม่มีภาพหลังติดตั้ง 1: JOB-1'));
});
test('closing ignores stale callbacks and does not issue further photo requests',async()=>{
 const p=page(),requests=[];p.context.rows=[rows[0]];vm.runInContext("portalData={assetRows:rows,loadedAt:'2026-10-22T00:00:00Z'}",p.context);api(p,r=>requests.push(r));p.context.openExecutivePhotoReport();p.context.closeExecutivePhotoReport();requests[0].success('original');await tick();assert.equal(requests.length,1);assert.equal(p.document.getElementById('executivePhotoModal').hidden,true);assert.equal(p.document.getElementById('executivePhotoPages').innerHTML,'');assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);
});
test('load errors block print, retry rebuilds cleanly, and units without completed jobs stay unprintable',async()=>{
 const p=page();p.context.rows=[rows[0]];vm.runInContext("portalData={assetRows:rows,loadedAt:'2026-10-22T00:00:00Z'}",p.context);api(p,r=>r.failure(new Error('Drive unavailable')));p.context.openExecutivePhotoReport();await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);assert.ok(p.document.getElementById('executivePhotoStatus').textContent.includes('ไม่สำเร็จ'));
 api(p,r=>r.success(''));await p.context.loadExecutivePhotoReport();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);const html=p.context.executivePhotoPrintHtml('<article>fixture</article>');assert.ok(html.includes('size:A4 portrait'));assert.ok(html.includes('break-after:page'));assert.ok(!html.includes('onclick='));
 vm.runInContext("executivePhotoSource=[{jobNo:'WAIT',installStatus:'รอดำเนินการ'}]",p.context);await p.context.loadExecutivePhotoReport();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);assert.ok(p.document.getElementById('executivePhotoPages').innerHTML.includes('ยังไม่มี Job ติดตั้งเสร็จ'));
});

test('submission bundle snapshots summary and photos from the same selected unit in one printable document',async()=>{
 const p=page();p.context.rows=[rows[0]];vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'2026-10-22T00:00:00Z'};dashboardDepartment='การเงิน'",p.context);api(p,r=>r.success('original-after1'));p.context.openExecutivePhotoReport(true);await tick();await tick();
 const content=p.document.getElementById('executivePhotoPages').innerHTML;assert.ok(content.includes('executive-submission-summary'));assert.ok(content.includes('สรุปติดตั้งและรับคืนตามหน่วยงาน'));assert.ok(content.includes('ภาพเครื่องที่ติดตั้งเสร็จ'));assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
 const html=p.context.executivePhotoPrintHtml(content,true);assert.ok(html.includes('ชุดเอกสารสรุปติดตั้งและรับคืนสำหรับผู้บริหาร'));assert.ok(html.includes('@page executive-summary{size:A4 landscape'));assert.ok(html.includes('@page executive-photos{size:A4 portrait'));assert.ok(!content.includes('รายละเอียดประกอบการตรวจสอบ'));
});
test('a submission without completed computers can print its summary without issuing image requests',async()=>{
 const p=page();p.context.rows=[{jobNo:'WAIT',installStatus:'รอดำเนินการ'}];vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'2026-10-22T00:00:00Z'}",p.context);let calls=0;api(p,()=>calls++);p.context.openExecutivePhotoReport(true);await tick();assert.equal(calls,0);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.ok(p.document.getElementById('executivePhotoStatus').textContent.includes('พิมพ์ได้เฉพาะรายงานสรุป'));
});

test('switching the print unit scopes both the summary and photos, ignores stale responses and reuses downloaded originals',async()=>{
 const p=page(),requests=[];p.context.rows=rows;vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'snapshot-1'};dashboardDepartment='การเงิน'",p.context);api(p,r=>requests.push(r));
 p.context.openExecutivePhotoReport(true);assert.equal(requests.length,4);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);
 const switching=p.context.changeExecutivePhotoDepartment('เภสัช');assert.equal(requests.length,5);assert.equal(requests[4].job,'JOB-6');
 requests[4].success('original-pharmacy');await switching;assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.ok(p.document.getElementById('executivePhotoPages').innerHTML.includes('หน่วยงาน: เภสัช'));assert.ok(!p.document.getElementById('executivePhotoPages').innerHTML.includes('JOB-1'));
 requests[0].success('stale-finance');await tick();assert.ok(p.document.getElementById('executivePhotoJob0').innerHTML.includes('original-pharmacy'));assert.equal(requests.length,5);
 await p.context.changeExecutivePhotoDepartment('เภสัช');assert.equal(requests.length,5);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
 const retry=p.context.loadExecutivePhotoReport(true);assert.equal(requests.length,6);requests[5].success('updated-original');await retry;assert.ok(p.document.getElementById('executivePhotoJob0').innerHTML.includes('updated-original'));
});

test('photo loading uses at most four RPCs at a time and failures are retried instead of cached',async()=>{
 const p=page(),requests=[];p.context.rows=rows;vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'snapshot-1'};dashboardDepartment='การเงิน'",p.context);api(p,r=>requests.push(r));p.context.openExecutivePhotoReport();assert.equal(requests.length,4);
 requests[0].success('first-original');await tick();assert.equal(requests.length,5);requests[1].failure(new Error('Drive unavailable'));await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);
 const retry=p.context.loadExecutivePhotoReport();await tick();assert.equal(requests.length,9);assert.equal(requests.filter(r=>r.job==='JOB-1').length,1);assert.equal(requests.filter(r=>r.job==='JOB-2').length,2);
 for(const r of requests.slice(5))r.success('retried-original');await retry;assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
});
