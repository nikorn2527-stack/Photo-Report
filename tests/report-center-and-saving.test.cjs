const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'..','Portal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/<\?!=[\s\S]*?\?>/g,'"dashboard"');
function page(){
 const elements=new Map(),calls=[];
 const document={getElementById(id){if(!elements.has(id))elements.set(id,{value:'summary',innerHTML:'',textContent:''});return elements.get(id);}};
 const runner={withSuccessHandler(success){return {withFailureHandler(failure){return new Proxy({},{get(target,method){return (...args)=>calls.push({method,args,success,failure});}});}};}};
 const context=vm.createContext({document,window:{addEventListener(){},setTimeout,clearTimeout},google:{script:{run:runner}}});new vm.Script(script).runInContext(context);
 vm.runInContext('refreshAssetRow=function(){};renderDashboard=function(){};renderWorkTable=function(){};renderPlanView=function(){};',context);
 return {context,document,calls};
}
const rows=[{rowNumber:4,jobNo:'J1',building:'B1',floor:'1',department:'A',installStatus:'ติดตั้งเสร็จ',oldComSn:'C1',oldMonitorSn:'M1'},{rowNumber:5,jobNo:'J2',building:'B1',floor:'1',department:'A',installStatus:'รอดำเนินการ',oldComSn:'ไม่มีเลข'},{rowNumber:6,jobNo:'J3',building:'B2',floor:'1',department:'A',installStatus:'ติดตั้งเสร็จ',oldComSn:'C3'}];
function seed(p){p.context.source=structuredClone(rows);vm.runInContext('portalData={assetRows:source,jobWorkRows:source.map(function(row){return Object.assign({},row,{missingPrimary:[],hasAfterPhoto:true});})};',p.context);}
test('report location filters distinguish identically named departments and leave source and dashboard scope intact',()=>{
 const p=page();seed(p);vm.runInContext("reportFilters.building='B1';reportFilters.department='A';",p.context);
 const report=p.context.centerReportData();assert.equal(report.totals.com,2);assert.equal(report.totals.pc,1);assert.equal(report.totals.aio,1);assert.equal(report.totals.total,2);assert.equal(p.context.getDashboardAssetRows().length,3);
 assert.equal(p.context.centerCsvRows()[1][9],2);assert.equal(p.context.centerCsvRows()[0].at(-1),'ผลการทดสอบ');
});
test('test result follows installation status per unit without depending on photographs',()=>{
 const p=page();const report=p.context.buildExecutiveReportData(rows,[]);assert.equal(report.groups[0].testStatus,'ผ่าน 1/2 เครื่อง');assert.equal(report.groups[1].testStatus,'ผ่านการทดสอบ');
 assert.equal(p.context.getUnitTestStatus([{installStatus:'รอดำเนินการ'}]),'');assert.equal(p.context.getUnitTestStatus([]),'');
 for(const html of [p.context.executiveReportHtml(report),p.context.executiveReportPartHtml(report,'units'),p.context.executiveSubmissionSummaryHtml(report,false)]){assert.ok(html.includes('ผลการทดสอบ'));assert.ok(html.includes('ผ่าน 1/2 เครื่อง'));assert.ok(html.includes('ผ่านการทดสอบ'));}
});
test('summary Job layout exports actual Job fields while machine export excludes unfinished jobs and private fields',()=>{
 const p=page();seed(p);p.document.getElementById('reportLayout').value='jobs';let csv=p.context.centerCsvRows();assert.equal(csv[0][0],'เลขงาน');assert.equal(csv.length,4);
 vm.runInContext("reportCenterType='machines'",p.context);csv=p.context.centerCsvRows();assert.equal(csv.length,3);assert.ok(!JSON.stringify(csv).includes('J2'));assert.equal(csv[0].at(-1),'IP');
});
test('saving one row acknowledges independently and never reloads the full portal',()=>{
 const p=page();seed(p);p.context.updateInstallStatus(5,'ติดตั้งเสร็จ','');p.context.handleAssetStatusChange(4,'ส่งมอบแล้ว');
 assert.equal(p.calls.length,2);assert.equal(vm.runInContext('pendingAssetSaves.size',p.context),2);assert.equal(vm.runInContext('portalData.assetRows[1].installStatus',p.context),'รอดำเนินการ');
 p.calls[1].success({message:'saved'});assert.equal(vm.runInContext('pendingAssetSaves.size',p.context),1);assert.equal(vm.runInContext('portalData.assetRows[0].status',p.context),'ส่งมอบแล้ว');
 p.calls[0].success({message:'saved'});assert.equal(vm.runInContext('pendingAssetSaves.size',p.context),0);assert.equal(vm.runInContext('portalData.assetRows[1].installStatus',p.context),'ติดตั้งเสร็จ');assert.equal(vm.runInContext('portalData.jobWorkRows[1].installStatus',p.context),'ติดตั้งเสร็จ');assert.equal(p.calls.length,2);
 assert.equal(p.context.centerReportData().groups[0].testStatus,'ผ่านการทดสอบ');
});
test('failed status saves preserve acknowledged data, release pending rows, and allow retry',()=>{
 const p=page();seed(p);p.context.handleAssetStatusChange(4,'ส่งมอบแล้ว');p.context.handleAssetStatusChange(4,'รอส่งมอบ');assert.equal(p.calls.length,1);
 p.calls[0].failure(new Error('offline'));assert.equal(vm.runInContext('portalData.assetRows[0].status',p.context),undefined);assert.equal(vm.runInContext('pendingAssetSaves.size',p.context),0);assert.ok(p.document.getElementById('portalStatus').textContent.includes('ไม่สำเร็จ'));
 p.context.handleAssetStatusChange(4,'ส่งมอบแล้ว');assert.equal(p.calls.length,2);p.calls[1].success({});assert.equal(vm.runInContext('portalData.assetRows[0].status',p.context),'ส่งมอบแล้ว');
});
test('full refresh is deferred while a status save is pending',()=>{
 const p=page();seed(p);p.context.handleAssetStatusChange(4,'ส่งมอบแล้ว');p.context.loadPortal();assert.equal(p.calls.length,1);assert.ok(p.document.getElementById('portalStatus').textContent.includes('กำลังบันทึก'));
});
test('image print readiness waits for decoding and rejects failed image decoding',async()=>{
 const p=page();let finish;const pending=new Promise(resolve=>{finish=resolve;});let ready=false;
 const image={complete:true,naturalWidth:1600,decode(){return pending;}};
 const result=p.context.waitForWorkPrintImages({querySelectorAll(){return [image];}}).then(()=>{ready=true;});await Promise.resolve();assert.equal(ready,false);finish();await result;assert.equal(ready,true);
 await assert.rejects(p.context.waitForWorkPrintImages({querySelectorAll(){return [{complete:true,naturalWidth:1600,decode(){return Promise.reject(new Error('decode failed'));}}];}}),/decode failed/);
});

test('report signoffs are optional per report, default to formal photo reports, and never appear twice',()=>{
 const p=page(),c=p.context;assert.equal(c.reportSignoffsEnabled('summary'),false);assert.equal(c.reportSignoffsEnabled('progress'),false);assert.equal(c.reportSignoffsEnabled('photos'),true);assert.equal(c.reportSignoffsEnabled('evidence'),true);const html='<html><body>table'+c.reportSignoffHtml()+'</body></html>';assert.ok(!c.applyReportSignoffs(html,'summary').includes('ผู้จัดทำ'));vm.runInContext("reportSignoffPreferences.summary=true",c);assert.equal((c.applyReportSignoffs(html,'summary').match(/class="report-signoff"/g)||[]).length,1);assert.ok(c.applyReportSignoffs('<html><body>issues</body></html>','summary').includes('ผู้ตรวจสอบ'));assert.equal(c.reportSignoffsEnabled('progress'),false);
});

test('signed tables reserve a repeated footer without duplicating totals, dropping rows or creating a separate signature table',()=>{
 const p=page(),c=p.context;seed(p);const report=c.centerReportData(),raw=c.executiveReportHtml(report);vm.runInContext('reportSignoffPreferences.summary=true',c);const html=c.applyReportSignoffs(raw,'summary');assert.equal((html.match(/<table\b/g)||[]).length,1);assert.equal((html.match(/class="report-signoff-foot"/g)||[]).length,1);assert.equal((html.match(/>รวม<\/td>/g)||[]).length,1);assert.ok(html.includes('display:table-footer-group'));assert.equal((html.match(/<tr\b/g)||[]).length,report.groups.length+3);const foot=html.match(/<tfoot[\s\S]*?<\/tfoot>/)[0];assert.ok(foot.includes('ผู้จัดทำ'));assert.ok(foot.includes('ผู้ตรวจสอบ'));assert.ok(!foot.includes('>รวม</td>'));assert.equal(c.applyReportSignoffs(html,'summary'),html);vm.runInContext('reportSignoffPreferences.summary=false',c);assert.ok(!c.applyReportSignoffs(html,'summary').includes('ผู้จัดทำ'));
});
