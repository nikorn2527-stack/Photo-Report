const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','Portal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/<\?!=[\s\S]*?\?>/g,'"dashboard"');
function page(){const elements=new Map();const document={getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',classList:{toggle(){}},querySelectorAll(){return []}});return elements.get(id)}};const context=vm.createContext({document,window:{addEventListener(){}}});new vm.Script(script).runInContext(context);return {context,document};}
const rows=[
 {rowNumber:4,jobNo:'JOB-1',department:' การเงิน ',floor:'1',installStatus:'ติดตั้งเสร็จ',oldComSn:'AIO-1',status:'ส่งมอบแล้ว'},
 {rowNumber:5,jobNo:'JOB-2',department:'การเงิน',floor:'5',installStatus:'ติดตั้งเสร็จ',oldComSn:'PC-1',oldMonitorSn:'MON-1',oldUpsSn:'ไม่มีเลข'},
 {rowNumber:6,jobNo:'JOB-3',department:'เภสัช',installStatus:'ติดตั้งไม่ได้',installReason:'รอหน่วยงาน',oldMonitorSn:'ไม่มี'},
 {rowNumber:7,jobNo:'JOB-4',department:'เภสัช',installStatus:'รอดำเนินการ',oldUpsSn:'UPS-1'},
 {rowNumber:8,jobNo:'JOB-5',installStatus:'ติดตั้งเสร็จ'}
];
const work=[{rowNumber:4,jobNo:'JOB-1',workStatus:'งานจบ'},{rowNumber:5,jobNo:'JOB-2',workStatus:'ยังไม่จบ',blockers:['ขาดรูปป้ายหน่วยงาน']}];
test('executive summary groups by building, floor and trimmed department, including unnamed departments',()=>{
 const {context}=page(),before=JSON.stringify(rows),report=context.buildExecutiveReportData(rows,work,'2026-10-22T00:00:00Z');
 assert.equal(report.groups.length,4);const finance=report.groups.filter(r=>r.department==='การเงิน');assert.equal(finance.length,2);assert.equal(finance.reduce((n,r)=>n+r.total,0),2);assert.ok(finance.every(r=>r.percent===100));
 assert.equal(report.totals.total,5);assert.equal(report.totals.completed,3);assert.equal(report.totals.remaining,2);assert.equal(report.totals.percent,60);assert.equal(report.totals.issues,1);
 assert.equal(report.attention.length,1);assert.equal(report.attention[0].jobNo,'JOB-3');assert.equal(report.attention[0].detail,'รอหน่วยงาน');
 assert.equal(JSON.stringify(rows),before);
});
test('returned AIO, PC, monitors and UPS are independent; blank returns never create pending tasks',()=>{
 const {context}=page(),report=context.buildExecutiveReportData(rows,work);
 assert.equal(report.totals.aio,1);assert.equal(report.totals.pc,1);assert.equal(report.totals.monitor,2);assert.equal(report.totals.ups,2);assert.equal(report.totals.upsWithoutNumber,1);assert.equal(report.totals.monitorWithoutNumber,1);
 assert.ok(!report.attention.some(r=>r.jobNo==='JOB-1'||r.jobNo==='JOB-4'));
 const only=context.buildExecutiveReportData([{jobNo:'OK',installStatus:'ติดตั้งเสร็จ'}],[{jobNo:'OK',workStatus:'งานจบ'}]);assert.equal(only.attention.length,0);assert.equal(only.totals.ups,0);
});
test('executive totals count rows and pair components within each job while flagging duplicate numbers separately',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{department:'A',oldComSn:'COM-1'},{department:'B',oldComSn:'com-1',oldMonitorSn:'MON-1'},{department:'B',oldComSn:'ไม่มี'},{department:'B',oldComSn:'ไม่มีเลข',oldMonitorSn:'ไม่มี'}],[]);
 assert.equal(report.totals.pc,2);assert.equal(report.totals.aio,2);assert.equal(report.totals.comWithoutNumber,2);assert.equal(report.duplicates.length,1);
 assert.equal(report.groups.reduce((n,r)=>n+r.pc+r.aio,0),4);assert.ok(context.executiveDuplicateNotesHtml(report).includes('เลขครุภัณฑ์ซ้ำที่ต้องตรวจสอบ (1 เลข)'));
});
test('department filter scopes the complete dashboard and its reports without filtering the work table or source rows',()=>{
 const p=page();p.context.rows=rows;p.context.work=work;vm.runInContext("portalData={assetRows:rows,jobWorkRows:work,loadedAt:'2026-10-22T00:00:00Z'}",p.context);
 p.context.changeDashboardDepartment('การเงิน');assert.equal(p.context.getDashboardAssetRows().length,2);assert.equal(p.context.getExecutiveReport().totals.total,2);assert.equal(p.context.getCompletionReport().total,2);assert.equal(p.context.getReturnAssetReport().comCount,2);assert.equal(p.context.getIssueRows().length,1);
 assert.ok(p.document.getElementById('summaryCards').innerHTML.includes('1/2'));assert.equal(p.document.getElementById('dashboardDepartment').value,'การเงิน');assert.equal(vm.runInContext('portalData.assetRows.length',p.context),5);
 p.context.changeDashboardDepartment('เภสัช');assert.equal(p.context.getIssueRows().length,1);assert.equal(p.context.getExecutiveReport().totals.completed,0);
 p.context.changeDashboardDepartment('');assert.equal(p.context.getExecutiveReport().totals.total,5);
 vm.runInContext("dashboardDepartment='หน่วยงานที่ถูกลบ'",p.context);p.context.renderDashboard();assert.equal(p.context.getExecutiveReport().totals.total,5);
});
test('printable summary preserves selected department, escapes spreadsheet input and handles empty data',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{department:'<script>unit</script>',jobNo:'<img>',installStatus:'ติดตั้งไม่ได้',installReason:'<b>reason</b>',windowsKey:'SECRET'}],[],'2026-10-22T00:00:00Z','<script>unit</script>'),html=context.executiveReportHtml(report,true);
 assert.ok(html.includes('&lt;script&gt;unit&lt;/script&gt;'));assert.ok(html.includes('&lt;img&gt;'));assert.ok(context.executiveAttentionRows(report,true).includes('&lt;b&gt;reason&lt;/b&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('SECRET'));assert.ok(!html.includes('onclick='));assert.ok(!html.includes('คืนครบ'));
 const empty=context.buildExecutiveReportData([],[]);assert.equal(empty.totals.percent,0);assert.ok(context.executiveReportHtml(empty).includes('ยังไม่มีข้อมูลหน่วยงาน'));assert.ok(!context.executiveReportHtml(empty).includes('NaN'));
});

test('monitor-only returns appear as notes in screen/PDF without increasing computer totals or blocked-job counts',()=>{
 const p=page(),rows=[{jobNo:'MON-ONLY',department:'A',oldMonitorSn:'ไม่มีเลข',oldUpsSn:'UPS-1',installStatus:'ติดตั้งเสร็จ'}],work=[{jobNo:'MON-ONLY',workStatus:'งานจบ'}];
 const report=p.context.buildExecutiveReportData(rows,work);assert.equal(report.totals.pc,0);assert.equal(report.totals.aio,0);assert.equal(report.totals.monitor,1);assert.equal(report.totals.monitorOnly,1);assert.equal(report.totals.additional,0);assert.equal(report.totals.issues,0);assert.equal(report.attention.length,0);assert.equal(report.returnNotes.length,1);
 for(const html of [p.context.executiveReturnNotesHtml(report,false)]){assert.ok(html.includes('รับคืนเฉพาะจอ — กรุณาตรวจสอบ'));assert.ok(html.includes('MON-ONLY'));}
 assert.equal(p.context.executiveReturnNotesHtml(p.context.buildExecutiveReportData([{oldComSn:'C',oldMonitorSn:'M'}],[]),false),'');
});
test('blank fields remain unconfirmed unless the no-old-equipment checkbox is checked; paired-PC totals remain consistent',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{jobNo:'ADD',installStatus:'ติดตั้งเสร็จ',oldComSn:' ',oldMonitorSn:null,oldUpsSn:''},{jobNo:'UPS',oldUpsSn:'ไม่มีเลข'},{jobNo:'PC1',oldComSn:'COM',oldMonitorSn:'MON'},{jobNo:'PC2',oldComSn:'COM',oldMonitorSn:'MON'},{jobNo:'AIO',oldComSn:'ไม่มีเลข'},{jobNo:'MON',oldMonitorSn:'MON'}],[]);
 assert.equal(report.totals.additional,0);assert.equal(report.totals.returnInfoMissing,1);assert.equal(report.totals.pc,2);assert.equal(report.totals.aio,1);assert.equal(report.totals.monitor,3);assert.equal(report.totals.monitor,report.totals.pc+report.totals.monitorOnly);assert.equal(report.totals.ups,1);
 for(const key of ['pc','aio','monitor','ups','additional'])assert.equal(report.totals[key],report.groups.reduce((n,row)=>n+row[key],0));
 assert.ok(!context.executiveReportHtml(report).includes('ยังไม่มีข้อมูลรับคืน'));
});

test('duplicate warnings list the asset number, every affected job and department separately from received totals',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{jobNo:'JOB-A',department:'<unit A>',oldComSn:'C-1',oldMonitorSn:'M-1'},{jobNo:'JOB-B',department:'unit B',oldComSn:'C-1',oldMonitorSn:'M-1'}],[]);
 assert.equal(report.totals.pc,2);assert.equal(report.totals.monitor,2);assert.equal(report.duplicates.length,2);
 const html=context.executiveDuplicateNotesHtml(report);for(const text of ['C-1','M-1','JOB-A','JOB-B','&lt;unit A&gt;','unit B'])assert.ok(html.includes(text));assert.ok(!html.includes('<unit A>'));assert.ok(!context.executiveReportHtml(report,true).includes('เลขครุภัณฑ์ซ้ำที่ต้องตรวจสอบ (2 เลข)'));assert.equal(report.returnNotes.length,0);
});

test('executive view has four headline metrics and a compact print summary with optional detailed appendix',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{jobNo:'PRIVATE-JOB-A',oldComSn:'C',oldMonitorSn:'M'},{jobNo:'PRIVATE-JOB-B',oldComSn:'C',oldMonitorSn:'M'},{jobNo:'MON',oldMonitorSn:'ONLY'}],[]);
 assert.equal(context.executiveKpis(report).length,4);const summary=context.executiveReportHtml(report),details=context.executiveReportHtml(report,true);
 assert.ok(summary.includes('คอมพิวเตอร์ 2 เครื่อง'));assert.ok(summary.includes('จอ 3 จอ'));assert.ok(!summary.includes('เลขครุภัณฑ์ซ้ำ'));assert.ok(!summary.includes('รับคืนเฉพาะจอ'));
 assert.ok(!summary.includes('PRIVATE-JOB-A'));assert.ok(details.includes('PRIVATE-JOB-A'));assert.ok(!details.includes('รายละเอียดประกอบการตรวจสอบ'));
 assert.equal((context.executiveHeaders().match(/<th>/g)||[]).length,13);
});

test('executive and submission figures use the reference completion report: 156 total, 126 completed, 30 remaining, 81%, 80 fully complete',()=>{
 const {context}=page(),rows=Array.from({length:156},(_,i)=>({rowNumber:i+4,jobNo:'JOB-'+i,department:i%2?'A':'B',installStatus:i<126?'ติดตั้งเสร็จ':'รอดำเนินการ',oldComSn:i<100?'COM-'+i:'',oldMonitorSn:i<60?'MON-'+i:'',oldUpsSn:i<90?'UPS-'+i:''})),work=rows.map((r,i)=>({rowNumber:r.rowNumber,jobNo:r.jobNo,workStatus:i<80?'งานจบ':'ยังไม่จบ'}));
 for(const selected of [rows,rows.filter(r=>r.department==='A'),rows.filter(r=>r.department==='B')]){
  const old=context.buildCompletionReportData(selected,work),report=context.buildExecutiveReportData(selected,work);
  for(const key of ['total','completed','remaining','percent'])assert.equal(report.totals[key],old[key]);

 }
 const report=context.buildExecutiveReportData(rows,work);assert.equal(report.totals.total,156);assert.equal(report.totals.completed,126);assert.equal(report.totals.remaining,30);assert.equal(report.totals.percent,81);assert.equal(report.totals.workComplete,undefined);assert.equal(report.totals.pendingReview,undefined);assert.equal(report.totals.additional,0);assert.equal(report.totals.returnInfoMissing,26);assert.equal(report.totals.pc,60);assert.equal(report.totals.aio,40);assert.equal(report.totals.monitor,60);assert.equal(report.totals.ups,90);
 assert.ok(context.executiveSubmissionSummaryHtml(report,false).includes('81%'));
});
test('blank return fields on pending, blocked or incompletely installed jobs never count as completed additional installations',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{installStatus:'รอดำเนินการ'},{installStatus:'ติดตั้งไม่ได้'},{installStatus:'ติดตั้งแล้วแต่ไม่เสร็จ'},{installStatus:'ติดตั้งเสร็จ'},{installStatus:'ติดตั้งเสร็จ',oldUpsSn:'ไม่มีเลข'}],[]);
 assert.equal(report.totals.additional,0);assert.equal(report.totals.returnInfoMissing,1);assert.equal(report.totals.completed,2);assert.equal(report.totals.remaining,3);assert.equal(report.totals.ups,1);assert.ok(!context.executiveBriefHtml(report).includes('ยังไม่มีข้อมูลรับคืน:'));
});

test('brand descriptions without asset numbers count every returned machine and never become duplicate asset IDs',()=>{
 const {context}=page(),rows=[{jobNo:'PC-1',oldComSn:'HP ไม่มีเลข',oldMonitorSn:'DELL ไม่มีเลข'},{jobNo:'PC-2',oldComSn:'HP ไม่มีเลข',oldMonitorSn:'DELL ไม่มีเลข'},{jobNo:'AIO',oldComSn:'เครื่อง HP AIO ไม่มีเลขครุภัณฑ์'}];
 const report=context.buildExecutiveReportData(rows,[]),returns=context.buildReturnAssetReportData(rows);assert.equal(report.totals.pc,2);assert.equal(report.totals.aio,1);assert.equal(report.totals.monitor,2);assert.equal(report.totals.comWithoutNumber,3);assert.equal(report.totals.monitorWithoutNumber,2);assert.equal(returns.comCount,3);assert.equal(returns.monitorCount,2);assert.equal(report.duplicates.length,0);
 for(const value of ['HP ไม่มีเลข','DELL ไม่มีเลข','เครื่องไม่มี เลขครุภัณฑ์']){assert.equal(context.classifyReturnedAsset(value).received,true);assert.equal(context.classifyReturnedAsset(value).noNumber,true);assert.equal(context.classifyReturnedAsset(value).number,'');}
});
test('confirmed no-old-equipment entries are separate from missing return information and never override entered returns',()=>{
 const {context}=page(),rows=[{installStatus:'ติดตั้งเสร็จ',noOldEquipment:true},{installStatus:'ติดตั้งเสร็จ',noOldEquipment:false},{installStatus:'ติดตั้งเสร็จ'},{installStatus:'รอดำเนินการ',noOldEquipment:true},{installStatus:'ติดตั้งเสร็จ',noOldEquipment:true,oldComSn:'COM',oldMonitorSn:'MON'}],report=context.buildExecutiveReportData(rows,[]);
 assert.equal(report.totals.additional,1);assert.equal(report.totals.returnInfoMissing,2);assert.equal(report.totals.pc,1);assert.equal(report.totals.monitor,1);assert.ok(context.executiveBriefHtml(report).includes('ติดตั้งจุดใหม่ / เพิ่มเครื่อง:'));
});

test('executive reports and optional appendix ignore photo completeness but retain real installation problems',()=>{
 const {context}=page(),assets=[{rowNumber:4,jobNo:'DONE',installStatus:'ติดตั้งเสร็จ',oldComSn:'C',oldMonitorSn:'M'},{rowNumber:5,jobNo:'BLOCKED',installStatus:'ติดตั้งไม่ได้',installReason:'รอไฟฟ้า'}];
 const missing=[{rowNumber:4,jobNo:'DONE',workStatus:'ยังไม่จบ',blockers:['ขาดรูปป้ายหน่วยงาน'],primaryPhotoComplete:false}],complete=[{rowNumber:4,jobNo:'DONE',workStatus:'งานจบ',primaryPhotoComplete:true}];
 const a=context.buildExecutiveReportData(assets,missing),b=context.buildExecutiveReportData(assets,complete);assert.equal(a.totals.completed,1);assert.equal(a.totals.remaining,1);assert.equal(a.attention.length,1);assert.equal(a.attention[0].jobNo,'BLOCKED');
 for(const details of [false,true]){const html=context.executiveReportHtml(a,details);assert.equal(html,context.executiveReportHtml(b,details));assert.doesNotMatch(html,/ขาดรูป|รูปไม่ครบ|รอตรวจข้อมูลหลังติดตั้ง|ข้อมูลและรูปครบ/);assert.ok(!html.includes('รอไฟฟ้า'));}
 const installation=context.buildCompletionReportData(assets,missing),html=context.completionReportHtml(installation);assert.doesNotMatch(html,/ขาดรูป|ความครบถ้วนของงาน|ข้อมูลและรูปครบ|รอตรวจข้อมูล/);
});

test('executive returns have three categories and job detail reconciles all received counts',()=>{
 const {context}=page(),assets=[{jobNo:'PC',department:'A',oldComSn:'C1',oldMonitorSn:'M1',oldUpsSn:'ไม่มีเลข'},{jobNo:'AIO',department:'A',oldComSn:'HP ไม่มีเลข'},{jobNo:'MON',department:'B',oldMonitorSn:'M2'},{jobNo:'NEW',department:'B',noOldEquipment:true,installStatus:'ติดตั้งเสร็จ'},{jobNo:'UNKNOWN',department:'B',installStatus:'ติดตั้งเสร็จ'}],before=JSON.stringify(assets),report=context.buildExecutiveReportData(assets,[]);
 assert.equal(report.totals.com,2);assert.equal(report.totals.monitor,2);assert.equal(report.totals.ups,1);assert.equal(report.returnJobs.length,5);assert.equal(report.groups.reduce((n,r)=>n+r.com,0),2);assert.equal(report.totals.com,report.totals.pc+report.totals.aio);
 for(const [field,total]of [['comNo','com'],['monitorNo','monitor'],['upsNo','ups']])assert.equal(report.returnJobs.filter(r=>context.classifyReturnedAsset(r[field]).received).length,report.totals[total]);
 const html=context.executiveReturnJobRows(report,true);assert.ok(html.includes('C1'));assert.ok(html.includes('M1'));assert.ok(html.includes('ไม่มีเลขครุภัณฑ์'));assert.ok(html.includes('ติดตั้งจุดใหม่ / เพิ่มเครื่อง'));assert.ok(html.includes('ยังไม่มีข้อมูลรับคืน'));
 const summary=context.executiveReportHtml(report),details=context.executiveReportHtml(report,true);assert.ok(summary.includes('คอมพิวเตอร์ 2 เครื่อง'));assert.ok(!summary.includes('PC คืน'));assert.ok(!summary.includes('AIO คืน'));assert.ok(details.includes('รายการรับคืนตามเลขงาน'));assert.ok(details.includes('C1'));assert.equal(JSON.stringify(assets),before);
});


test('overview and executive PDFs omit operational warnings; asset checks retain all jobs across dashboard filters',()=>{
 const p=page(),assets=[{jobNo:'MISSING',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'NEW',department:'B',installStatus:'ติดตั้งเสร็จ',noOldEquipment:true},{jobNo:'PENDING',department:'B',installStatus:'รอดำเนินการ'},{jobNo:'RETURNED',department:'B',installStatus:'ติดตั้งเสร็จ',oldUpsSn:'UPS'}];
 p.context.assets=assets;vm.runInContext("portalData={assetRows:assets,jobWorkRows:[],loadedAt:'2026-10-22T00:00:00Z'};dashboardDepartment='B'",p.context);p.context.renderExecutiveDashboard();
 const checks=p.document.getElementById('returnInfoMissingNotes').innerHTML;assert.ok(checks.includes('MISSING'));for(const job of ['NEW','PENDING','RETURNED'])assert.ok(!checks.includes(job));
 assert.ok(p.document.getElementById('executiveReturnJobs').innerHTML.includes('MISSING'));
 const report=p.context.buildExecutiveReportData(assets,[]);for(const details of [false,true])assert.doesNotMatch(p.context.executiveReportHtml(report,details),/ยังไม่มีข้อมูลรับคืน|ต้องติดตาม|กรุณาตรวจสอบ|เลขครุภัณฑ์ซ้ำ/);
 const html=fs.readFileSync(path.join(__dirname,'..','Portal.html'),'utf8');const overview=html.slice(html.indexOf('<section id="dashboardView"'),html.indexOf('<section id="workView"'));assert.doesNotMatch(overview,/id="executiveDetails"|id="returnAssetDuplicates"|id="issueTableBody"/);
 const asset=html.slice(html.indexOf('<section id="assetView"'),html.indexOf('<section id="documentsView"'));assert.ok(asset.includes('id="returnInfoMissingNotes"'));assert.ok(asset.includes('id="returnAssetDuplicates"'));
});


test('report tables keep blank counts and sort building, numeric floor, department then job without changing totals',()=>{
 const {context}=page(),assets=[{jobNo:'J10',building:'B',floor:'10',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'J2',building:'B',floor:'2',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'J1',building:'A',floor:'3',department:'Z',oldComSn:'C',installStatus:'รอดำเนินการ'}],before=JSON.stringify(assets),report=context.buildExecutiveReportData(assets,[]);
 assert.deepEqual(Array.from(report.groups,r=>[r.building,r.floor,r.department]),[['A','3','Z'],['B','2','A'],['B','10','A']]);assert.deepEqual(Array.from(report.returnJobs,r=>r.jobNo),['J1','J2','J10']);
 for(const html of [context.executiveDepartmentRows(report),context.completionAreaRows(context.buildCompletionReportData(assets,[])),context.returnAssetAreaRows(context.buildReturnAssetReportData(assets))]){assert.doesNotMatch(html,/>0%?<\/td>/);assert.ok(html.includes('<td></td>'));}
 assert.equal(context.reportTextCell('ไม่ระบุ'),'');assert.equal(context.reportTextCell(' A\nB '),'A B');assert.equal(report.totals.total,3);assert.equal(report.totals.completed,2);assert.equal(JSON.stringify(assets),before);
 const html=context.executiveReportHtml(report);assert.ok(html.includes('white-space:nowrap'));assert.ok(html.includes('<th>ตึก</th><th>ชั้น</th><th>หน่วยงาน</th>'));
});

test('return follow-up links reopen the correct list tab and search the selected job',()=>{
 const p=page();vm.runInContext('portalData={assetRows:[],jobWorkRows:[]}',p.context);
 p.context.showSectionTab('asset','checks');p.context.openReturnAssetCheck({getAttribute(){return 'JOB-1'}});
 assert.equal(p.document.getElementById('asset-list-panel').hidden,false);assert.equal(p.document.getElementById('asset-checks-panel').hidden,true);assert.equal(p.document.getElementById('assetSearch').value,'JOB-1');
 p.context.showSectionTab('work','issues');p.context.openExecutiveWork({getAttribute(){return 'JOB-1'}});
 assert.equal(p.document.getElementById('work-jobs-panel').hidden,false);assert.equal(p.document.getElementById('work-issues-panel').hidden,true);assert.equal(p.document.getElementById('workSearch').value,'JOB-1');
});

test('refreshing report content preserves selected section tabs and asset searches',()=>{
 const p=page();vm.runInContext('portalData={assetRows:[],jobWorkRows:[]}',p.context);
 p.context.showSectionTab('dashboard','installation');p.context.renderDashboard();assert.equal(p.document.getElementById('dashboard-installation-panel').hidden,false);assert.equal(p.document.getElementById('dashboard-summary-panel').hidden,true);
 p.document.getElementById('assetSearch').value='JOB-2';p.context.showSectionTab('asset','checks');p.context.showSectionTab('asset','list');assert.equal(p.document.getElementById('assetSearch').value,'JOB-2');
 p.context.showSectionTab('documents','photos');p.context.renderDocuments();const html=p.document.getElementById('documentGrid').innerHTML;assert.match(html,/id="documents-photos-panel" aria-labelledby="documents-photos-tab">/);assert.match(html,/id="documents-delivery-panel" aria-labelledby="documents-delivery-tab" hidden>/);
});

test('photo-unit filter keeps all jobs when every completed job has after1, and leaves project progress unchanged',()=>{
 const p=page(),assets=[{jobNo:'A1',department:'A',installStatus:'ติดตั้งเสร็จ',oldComSn:'C1'},{jobNo:'A2',department:' A ',installStatus:'รอดำเนินการ'},{jobNo:'B1',department:'B',installStatus:'ติดตั้งเสร็จ'},{jobNo:'C1',department:'C',installStatus:'รอดำเนินการ'}],work=[{jobNo:' a1 ',hasAfterPhoto:true},{jobNo:'A2',hasAfterPhoto:false},{jobNo:'B1',hasAfterPhoto:false},{jobNo:'C1',hasAfterPhoto:true}];
 p.context.assets=assets;p.context.work=work;vm.runInContext('portalData={assetRows:assets,jobWorkRows:work}',p.context);p.document.getElementById('executivePhotosOnly').checked=true;
 const report=p.context.getExecutiveReport();assert.equal(report.totals.total,2);assert.equal(report.totals.completed,1);assert.equal(report.totals.remaining,1);assert.equal(report.totals.com,1);assert.ok(report.groups.every(r=>r.department==='A'));assert.equal(report.photoDepartmentsOnly,true);assert.equal(p.context.getCompletionReport().total,4);
 p.document.getElementById('executivePhotosOnly').checked=false;assert.equal(p.context.getExecutiveReport().totals.total,4);assert.equal(p.context.getExecutiveReport().groups.length,3);
});


test('complete-unit filtering checks only after1; unknown or missing after1 on any completed job excludes the unit',()=>{
 const {context}=page(),rows=[{jobNo:'A1',department:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'A2',department:' A ',installStatus:'ติดตั้งเสร็จ'},{jobNo:'B1',department:'B',installStatus:'ติดตั้งเสร็จ'},{jobNo:'B2',department:'B',installStatus:'รอดำเนินการ'}];
 const work=[{jobNo:'A1',hasAfterPhoto:true,primaryPhotoComplete:true},{jobNo:'A2',hasAfterPhoto:false,primaryPhotoComplete:false,totalPhotoCount:8},{jobNo:'B1',hasAfterPhoto:true,primaryPhotoComplete:false,totalPhotoCount:1,missingPrimary:['ชื่อหน่วยงาน','ก่อนติดตั้ง']}];assert.deepEqual(Array.from(context.filterExecutivePhotoDepartments(rows,work),r=>r.jobNo),['B1','B2']);assert.equal(context.filterExecutivePhotoDepartments(rows,[]).length,0);
});


test('unit tables show matching grand totals and weighted progress in screen, standalone print and photo bundles',()=>{
 const p=page(),assets=[{jobNo:'A1',department:'A',installStatus:'ติดตั้งเสร็จ',oldComSn:'C1',oldMonitorSn:'M1'},{jobNo:'A2',department:'A',installStatus:'รอดำเนินการ'},{jobNo:'B1',department:'B',installStatus:'ติดตั้งเสร็จ',oldComSn:'ไม่มีเลข',oldUpsSn:'U1'}],report=p.context.buildExecutiveReportData(assets,[]),footer=p.context.executiveDepartmentTotals(report);
 const values=Array.from(footer.matchAll(/<td(?: colspan="3")?>(.*?)<\/td>/g),m=>m[1]);assert.deepEqual(values,['รวม','3','2','1','67%','2','1','1','1','1','']);
 for(const html of [p.context.executiveReportHtml(report),p.context.executiveReportPartHtml(report,'units'),p.context.executiveSubmissionSummaryHtml(report,false)])assert.ok(html.includes('<tfoot>'+footer+'</tfoot>'));
 p.context.assets=assets;vm.runInContext('portalData={assetRows:assets,jobWorkRows:[]}',p.context);p.context.renderExecutiveDashboard();assert.equal(p.document.getElementById('executiveDepartmentTotals').innerHTML,footer);
});
