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
test('report snapshots the selected unit and enables photo printing as each original becomes available',async()=>{
 const p=page(),requests=[];p.context.rows=rows.slice(0,2);vm.runInContext("portalData={assetRows:rows,loadedAt:'2026-10-22T00:00:00Z'};dashboardDepartment='การเงิน'",p.context);api(p,r=>{requests.push(r);});p.context.openExecutivePhotoReport();await tick();assert.equal(requests.length,2);const photos=requests.filter(r=>r.method==='photo');assert.ok(photos.every(r=>r.type==='after1'));assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);
 photos[0].success('original-one');await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);photos[1].success('original-two');await tick();await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.ok(p.document.getElementById('executivePhotoJob0').innerHTML.includes('original-one'));assert.ok(p.document.getElementById('executivePhotoStatus').textContent.includes('2 เครื่อง · 2 รูป'));
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
 p.context.openExecutivePhotoReport(true);assert.equal(requests.length,4);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
 const switching=p.context.changeExecutivePhotoDepartment('เภสัช');assert.equal(requests.length,5);assert.equal(requests[4].job,'JOB-6');
 requests[4].success('original-pharmacy');await switching;assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.ok(p.document.getElementById('executivePhotoPages').innerHTML.includes('หน่วยงาน: เภสัช'));assert.ok(!p.document.getElementById('executivePhotoPages').innerHTML.includes('JOB-1'));
 requests[0].success('stale-finance');await tick();assert.ok(p.document.getElementById('executivePhotoJob0').innerHTML.includes('original-pharmacy'));assert.equal(requests.length,5);
 await p.context.changeExecutivePhotoDepartment('เภสัช');assert.equal(requests.length,5);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
 const retry=p.context.loadExecutivePhotoReport(true);assert.equal(requests.length,6);requests[5].success('updated-original');await retry;assert.ok(p.document.getElementById('executivePhotoJob0').innerHTML.includes('updated-original'));
});

test('photo loading uses at most four RPCs at a time and failures are retried instead of cached',async()=>{
 const p=page(),requests=[];p.context.rows=rows;vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'snapshot-1'};dashboardDepartment='การเงิน'",p.context);api(p,r=>requests.push(r));p.context.openExecutivePhotoReport();assert.equal(requests.length,4);
 requests[0].success('first-original');await tick();assert.equal(requests.length,5);requests[1].failure(new Error('Drive unavailable'));await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
 const retry=p.context.loadExecutivePhotoReport();await tick();assert.equal(requests.length,9);assert.equal(requests.filter(r=>r.job==='JOB-1').length,1);assert.equal(requests.filter(r=>r.job==='JOB-2').length,2);
 for(const r of requests.slice(5))r.success('retried-original');await retry;assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
});

test('photo-only reports skip an entire unit if any completed job lacks after1, without requesting its photos',async()=>{
 const p=page(),requests=[];p.context.assets=[{jobNo:'A1',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'A2',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'B1',department:'B',installStatus:'ติดตั้งเสร็จ'}];p.context.work=[{jobNo:'A1',hasAfterPhoto:true},{jobNo:'A2',hasAfterPhoto:false},{jobNo:'B1',hasAfterPhoto:true,primaryPhotoComplete:false,missingPrimary:['ชื่อหน่วยงาน','ก่อนติดตั้ง']}];vm.runInContext("portalData={assetRows:assets,jobWorkRows:work,loadedAt:'snapshot'}",p.context);p.document.getElementById('executivePhotosOnly').checked=true;api(p,r=>{requests.push(r);r.success('original');});await p.context.openExecutivePhotoReport(true);
 assert.deepEqual(requests.map(r=>r.job),['B1']);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.ok(!p.document.getElementById('executivePhotoSummary').innerHTML.includes('A1'));assert.equal(vm.runInContext('executivePhotoSnapshot.totals.total',p.context),3);
 await p.context.changeExecutivePhotoDepartment('A');assert.equal(requests.length,1);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);assert.ok(p.document.getElementById('executivePhotoPages').innerHTML.includes('ยังไม่มีหน่วยงานที่รูปครบ'));
});

test('photo-only printing verifies returned images, hides empty units and blocks empty reports',async()=>{
 const p=page();p.context.assets=[{jobNo:'A1',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'B1',department:'B',installStatus:'ติดตั้งเสร็จ'}];vm.runInContext("portalData={assetRows:assets,jobWorkRows:assets.map(r=>({jobNo:r.jobNo,hasAfterPhoto:true})),loadedAt:'snapshot'}",p.context);p.document.getElementById('executivePhotosOnly').checked=true;api(p,r=>r.success(r.job==='A1'?'original':''));await p.context.openExecutivePhotoReport(true);
 assert.equal(p.document.getElementById('executivePhotoPage0').hidden,false);assert.equal(p.document.getElementById('executivePhotoPage1').hidden,true);assert.equal(vm.runInContext('executivePhotoSnapshot.totals.total',p.context),2);assert.ok(!p.document.getElementById('executivePhotoStatus').textContent.includes('B1'));
 api(p,r=>r.success(''));await p.context.loadExecutivePhotoReport(true);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);assert.equal(p.document.getElementById('executivePhotoStatus').textContent,'ยังไม่มีรูปแนบ · พิมพ์สรุปได้');
});


test('summary printing works while photos are pending and never includes photo pages or the optional job appendix',async()=>{
 const p=page();p.context.rows=[{jobNo:'A1',department:'A',installStatus:'ติดตั้งเสร็จ'}];vm.runInContext("portalData={assetRows:rows,jobWorkRows:[{jobNo:'A1',hasAfterPhoto:true}],loadedAt:'snapshot'}",p.context);p.document.getElementById('executivePhotosOnly').checked=true;p.document.getElementById('executivePrintDetails').checked=true;let pending=0;api(p,()=>pending++);p.context.openExecutivePhotoReport(true);assert.equal(pending,1);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);assert.equal(p.document.getElementById('executiveSummaryPrint').disabled,false);
 let contents='',printed=0;p.context.openReportPrintPreview=html=>{contents=html;printed++;return Promise.resolve(true);};await p.context.printExecutivePhotoSummary();assert.equal(printed,1);assert.ok(contents.includes('หน่วยงาน: ทุกหน่วยงาน'));assert.ok(!contents.includes('รายการรับคืนตามเลขงาน'));assert.ok(!contents.includes('executive-photo-grid'));assert.ok(!contents.includes('<img'));assert.equal(pending,1);assert.equal(p.document.getElementById('executivePhotoPrint').disabled,true);
 contents='';await p.context.printExecutiveReport();assert.equal(printed,2);assert.ok(!contents.includes('รายการรับคืนตามเลขงาน'));
});


test('export snapshots only loaded photos while other originals remain pending or have failed',async()=>{
 const p=page(),requests=[];p.context.rows=rows.slice(0,2);vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'snapshot'}",p.context);api(p,r=>requests.push(r));p.context.openExecutivePhotoReport();requests[0].success('original-one');await tick();
 assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.equal(vm.runInContext('executivePhotoReady',p.context),false);let content=p.context.executiveLoadedPhotoContent();assert.ok(content.includes('JOB-1'));assert.ok(!content.includes('JOB-2'));assert.ok(!content.includes('กำลังโหลด'));assert.ok(!content.includes('ยังไม่มีภาพ'));assert.equal((content.match(/<img /g)||[]).length,1);
 requests[1].failure(new Error('Drive unavailable'));await tick();assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);assert.equal(p.context.executiveLoadedPhotoContent(),content);
});

test('selected table printing exports only that table without KPI cards, appendices or photos',()=>{
 const {context}=page(),report=context.buildExecutiveReportData(rows,[]);const units=context.executiveReportPartHtml(report,'units'),jobs=context.executiveReportPartHtml(report,'jobs');
 for(const html of [units,jobs]){assert.equal((html.match(/<table/g)||[]).length,1);assert.ok(!html.includes('<div class="summary">'));assert.ok(!html.includes('<img'));assert.ok(html.includes('size:A4 landscape'));}
 assert.ok(units.includes('<th>Computer</th>'));assert.ok(!units.includes('JOB-1'));assert.ok(jobs.includes('JOB-1'));assert.ok(jobs.includes('รายการรับคืนตามงาน'));
});

test('print preview populates an inline document before enabling its real print control and never opens a popup',async()=>{
 const p=page(),frame=p.document.getElementById('reportPrintFrame');let printed=0;p.context.window.open=()=>{throw new Error('Popup must not be used');};frame.contentDocument={body:{innerText:'Selected report'},fonts:{ready:Promise.resolve()},querySelectorAll(){return []}};frame.contentWindow={focus(){},print(){printed++}};
 const ready=p.context.openReportPrintPreview('<html><body>Selected report</body></html>','Report');assert.equal(frame.srcdoc,'<html><body>Selected report</body></html>');assert.equal(p.document.getElementById('reportPrintButton').disabled,true);p.context.printReportPreview();assert.equal(printed,0);
 await frame.onload();assert.equal(await ready,true);assert.equal(p.document.getElementById('reportPrintButton').disabled,false);p.context.printReportPreview();assert.equal(printed,1);p.context.closeReportPrintPreview();assert.equal(p.document.getElementById('reportPrintPreview').hidden,true);assert.equal(frame.srcdoc,'');
});

test('an empty or inaccessible print document shows an error and stays unprintable',async()=>{
 const p=page(),frame=p.document.getElementById('reportPrintFrame');frame.contentDocument={body:{innerText:''},querySelectorAll(){return []}};const ready=p.context.openReportPrintPreview('<html></html>');await frame.onload();assert.equal(await ready,false);assert.equal(p.document.getElementById('reportPrintButton').disabled,true);assert.ok(p.document.getElementById('reportPrintStatus').textContent.includes('เอกสารว่าง'));
});


test('printing requires all after1 originals of a unit but never waits for other units or other photo slots',async()=>{
 const p=page(),requests=[];p.context.assets=[{jobNo:'A1',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'A2',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'C1',department:'C',installStatus:'ติดตั้งเสร็จ'}];vm.runInContext("portalData={assetRows:assets,jobWorkRows:assets.map(r=>({jobNo:r.jobNo,hasAfterPhoto:true,primaryPhotoComplete:false,missingPrimary:['ชื่อหน่วยงาน','ก่อนติดตั้ง']})),loadedAt:'snapshot'}",p.context);p.document.getElementById('executivePhotosOnly').checked=true;api(p,r=>requests.push(r));p.context.openExecutivePhotoReport(true);
 requests.find(r=>r.job==='C1').success('C-original');await tick();assert.equal(p.document.getElementById('executivePhotoPage0').hidden,true);assert.equal(p.document.getElementById('executivePhotoPage1').hidden,false);let html=p.context.executiveLoadedPhotoContent();assert.ok(html.includes('C1'));assert.ok(!html.includes('A1'));assert.ok(!html.includes('A2'));assert.equal(p.document.getElementById('executivePhotoPrint').disabled,false);
 requests.find(r=>r.job==='A1').success('A1-original');await tick();assert.equal(p.document.getElementById('executivePhotoPage0').hidden,true);assert.ok(!p.context.executiveLoadedPhotoContent().includes('A1'));
 requests.find(r=>r.job==='A2').success('A2-original');await tick();assert.equal(p.document.getElementById('executivePhotoPage0').hidden,false);html=p.context.executiveLoadedPhotoContent();assert.ok(html.includes('A1'));assert.ok(html.includes('A2'));assert.ok(html.includes('C1'));
});

test('111 computer returns stay 111 on screen and in every print path when only 86 have complete after1 photos',async()=>{
 const p=page();p.context.assets=Array.from({length:111},(_,i)=>({jobNo:'JOB-'+i,department:i<86?'Ready':'Missing',installStatus:'ติดตั้งเสร็จ',oldComSn:i%10===0?'HP ไม่มีเลข':'COM-'+Math.floor(i/2)}));p.context.work=p.context.assets.map((r,i)=>({jobNo:r.jobNo,hasAfterPhoto:i<86}));vm.runInContext("portalData={assetRows:assets,jobWorkRows:work,loadedAt:'snapshot'}",p.context);p.document.getElementById('executivePhotosOnly').checked=true;const calls=[];api(p,r=>{calls.push(r.job);r.success('original')});
 assert.equal(p.context.getExecutiveReport().totals.com,111);assert.equal(p.context.getExecutiveReport().groups.length,2);await p.context.openExecutivePhotoReport(true);assert.equal(calls.length,86);assert.equal(vm.runInContext('executivePhotoSnapshot.totals.com',p.context),111);
 const footer=p.context.executiveDepartmentTotals(p.context.getExecutiveReport());for(const html of [p.context.executiveReportPartHtml(p.context.getExecutiveReport(),'summary'),p.context.executiveReportPartHtml(p.context.getExecutiveReport(),'units'),p.context.executiveLoadedPhotoContent()])assert.ok(html.includes('<tfoot>'+footer+'</tfoot>'));
 api(p,r=>r.success(''));await p.context.loadExecutivePhotoReport(true);assert.equal(vm.runInContext('executivePhotoSnapshot.totals.com',p.context),111);assert.equal(p.document.getElementById('executiveSummaryPrint').disabled,false);assert.ok(p.document.getElementById('executivePhotoPages').innerHTML.includes('<tfoot>'+footer+'</tfoot>'));
 await p.context.changeExecutivePhotoDepartment('Missing');assert.equal(vm.runInContext('executivePhotoSnapshot.totals.com',p.context),25);assert.equal(p.document.getElementById('executiveSummaryPrint').disabled,false);
});
