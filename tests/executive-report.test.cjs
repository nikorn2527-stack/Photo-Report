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
const work=[{rowNumber:4,jobNo:'JOB-1',workStatus:'งานจบ'},{jobNo:'JOB-2',workStatus:'ยังไม่จบ',blockers:['ขาดรูปป้ายหน่วยงาน']}];
test('executive summary groups by trimmed department across floors, including unnamed departments',()=>{
 const {context}=page(),before=JSON.stringify(rows),report=context.buildExecutiveReportData(rows,work,'2026-10-22T00:00:00Z');
 assert.equal(report.groups.length,3);const finance=report.groups.find(r=>r.department==='การเงิน');assert.equal(finance.total,2);assert.equal(finance.completed,2);assert.equal(finance.percent,100);assert.equal(finance.pendingReview,1);
 assert.equal(report.totals.total,5);assert.equal(report.totals.completed,3);assert.equal(report.totals.remaining,2);assert.equal(report.totals.percent,60);assert.equal(report.totals.pendingReview,2);assert.equal(report.totals.issues,1);
 assert.equal(report.attention.length,3);assert.ok(report.attention.some(r=>r.jobNo==='JOB-2'&&r.detail==='ขาดรูปป้ายหน่วยงาน'));assert.ok(report.attention.some(r=>r.jobNo==='JOB-5'&&r.detail==='รอตรวจข้อมูลติดตามงาน'));
 assert.equal(JSON.stringify(rows),before);
});
test('returned AIO, PC, monitors and UPS are independent; blank returns never create pending tasks',()=>{
 const {context}=page(),report=context.buildExecutiveReportData(rows,work);
 assert.equal(report.totals.aio,1);assert.equal(report.totals.pc,1);assert.equal(report.totals.monitor,2);assert.equal(report.totals.ups,2);assert.equal(report.totals.upsWithoutNumber,1);assert.equal(report.totals.monitorWithoutNumber,1);
 assert.ok(!report.attention.some(r=>r.jobNo==='JOB-1'||r.jobNo==='JOB-4'));
 const only=context.buildExecutiveReportData([{jobNo:'OK',installStatus:'ติดตั้งเสร็จ'}],[{jobNo:'OK',workStatus:'งานจบ'}]);assert.equal(only.attention.length,0);assert.equal(only.totals.ups,0);
});
test('duplicate computer numbers count once, PC takes precedence, and anonymous returns count by row',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{department:'A',oldComSn:'COM-1'},{department:'B',oldComSn:'com-1',oldMonitorSn:'MON-1'},{department:'B',oldComSn:'ไม่มี'},{department:'B',oldComSn:'ไม่มีเลข',oldMonitorSn:'ไม่มี'}],[]);
 assert.equal(report.totals.pc,2);assert.equal(report.totals.aio,1);assert.equal(report.totals.comWithoutNumber,2);assert.equal(report.duplicates.length,1);
 assert.equal(report.groups.reduce((n,r)=>n+r.pc+r.aio,0),4);assert.ok(context.executiveNote(report).includes('ผลรวมรายหน่วยงานอาจสูงกว่ายอดรวม'));
});
test('department filter scopes the complete dashboard and its reports without filtering the work table or source rows',()=>{
 const p=page();p.context.rows=rows;p.context.work=work;vm.runInContext("portalData={assetRows:rows,jobWorkRows:work,loadedAt:'2026-10-22T00:00:00Z'}",p.context);
 p.context.changeDashboardDepartment('การเงิน');assert.equal(p.context.getDashboardAssetRows().length,2);assert.equal(p.context.getExecutiveReport().totals.total,2);assert.equal(p.context.getCompletionReport().total,2);assert.equal(p.context.getReturnAssetReport().comCount,2);assert.equal(p.context.getIssueRows().length,0);
 assert.ok(p.document.getElementById('summaryCards').innerHTML.includes('1/2'));assert.equal(p.document.getElementById('dashboardDepartment').value,'การเงิน');assert.equal(vm.runInContext('portalData.assetRows.length',p.context),5);
 p.context.changeDashboardDepartment('เภสัช');assert.equal(p.context.getIssueRows().length,1);assert.equal(p.context.getExecutiveReport().totals.completed,0);
 p.context.changeDashboardDepartment('');assert.equal(p.context.getExecutiveReport().totals.total,5);
 vm.runInContext("dashboardDepartment='หน่วยงานที่ถูกลบ'",p.context);p.context.renderDashboard();assert.equal(p.context.getExecutiveReport().totals.total,5);
});
test('printable summary preserves selected department, escapes spreadsheet input and handles empty data',()=>{
 const {context}=page(),report=context.buildExecutiveReportData([{department:'<script>unit</script>',jobNo:'<img>',installStatus:'ติดตั้งไม่ได้',installReason:'<b>reason</b>',windowsKey:'SECRET'}],[],'2026-10-22T00:00:00Z','<script>unit</script>'),html=context.executiveReportHtml(report);
 assert.ok(html.includes('&lt;script&gt;unit&lt;/script&gt;'));assert.ok(html.includes('&lt;img&gt;'));assert.ok(html.includes('&lt;b&gt;reason&lt;/b&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('SECRET'));assert.ok(!html.includes('onclick='));assert.ok(!html.includes('คืนครบ'));
 const empty=context.buildExecutiveReportData([],[]);assert.equal(empty.totals.percent,0);assert.ok(context.executiveReportHtml(empty).includes('ยังไม่มีข้อมูลหน่วยงาน'));assert.ok(!context.executiveReportHtml(empty).includes('NaN'));
});
