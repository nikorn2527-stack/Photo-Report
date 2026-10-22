const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','Portal.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/<\?!=[\s\S]*?\?>/g,'"dashboard"');
function portal() {
  const elements=new Map();
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',className:''});return elements.get(id);}};
  const window={addEventListener(){}};
  const context=vm.createContext({window,document});
  new vm.Script(script,{filename:'Portal.html'}).runInContext(context);
  return {context,window,document};
}
function fixture() {
  return [
    {rowNumber:4,jobNo:'JOB-10',building:'B69',floor:'10',department:'A',brand:'Model A',aioSn:'SN-10',ipAddress:'10.0.0.10',installStatus:'ติดตั้งเสร็จ'},
    {rowNumber:5,jobNo:'JOB-2',building:'B69',floor:'2',department:'A',installStatus:'ติดตั้งเสร็จ'},
    {rowNumber:6,jobNo:'JOB-3',building:'B69',floor:'2',department:'A',prepStatus:'ติดตั้งเสร็จ',installStatus:'รอดำเนินการ'},
    {rowNumber:7,jobNo:'JOB-4',building:'BMT',floor:'1',department:'B',installStatus:'ติดตั้งไม่ได้'},
    {rowNumber:8,jobNo:'JOB-5',installStatus:'ติดตั้งแล้วแต่ไม่เสร็จ'}
  ];
}
test('completed counts use installation result, with separate strict work completion and stable source data',()=>{
  const {context}=portal(),rows=fixture(),before=JSON.stringify(rows);
  const report=context.buildCompletionReportData(rows,[{rowNumber:4,jobNo:'JOB-10',workStatus:'งานจบ'},{rowNumber:5,jobNo:'JOB-2',workStatus:'ยังไม่จบ'}],'2026-10-21T00:00:00Z');
  assert.equal(report.total,5);assert.equal(report.completed,2);assert.equal(report.remaining,3);assert.equal(report.percent,40);assert.equal(report.workComplete,1);
  assert.deepEqual(Array.from(report.rows,row=>row.jobNo),['JOB-2','JOB-10']);
  assert.equal(JSON.stringify(rows),before);
});
test('area totals include incomplete machines, preserve missing locations, and sort floors numerically',()=>{
  const {context}=portal(),report=context.buildCompletionReportData(fixture(),[]);
  const group=report.areas.find(row=>row.building==='B69'&&row.floor==='2');
  assert.equal(group.total,2);assert.equal(group.completed,1);assert.equal(group.remaining,1);assert.equal(group.percent,50);
  assert.deepEqual(Array.from(report.areas.filter(row=>row.building==='B69'),row=>row.floor),['2','10']);
  assert.ok(report.areas.some(row=>row.building==='ไม่ระบุ'&&row.total===1));
  assert.equal(report.areas.reduce((n,row)=>n+row.completed,0),report.completed);
  assert.equal(report.areas.reduce((n,row)=>n+row.total,0),report.total);
});
test('empty data displays zero progress and explicit empty states without NaN',()=>{
  const {context}=portal(),report=context.buildCompletionReportData([],[]);
  assert.equal(report.percent,0);assert.equal(report.remaining,0);
  const html=context.completionReportHtml(report);
  assert.ok(html.includes('ยังไม่มีข้อมูลเครื่อง'));assert.ok(context.completedMachinesReportHtml(report).includes('ยังไม่มีเครื่องที่ติดตั้งเสร็จ'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('undefined'));
});
test('machine rows escape spreadsheet HTML and do not disclose unrelated fields',()=>{
  const {context}=portal(),report=context.buildCompletionReportData([{rowNumber:4,jobNo:'<script>alert(1)</script>',department:'<img onerror=bad>',installStatus:'ติดตั้งเสร็จ',windowsKey:'DO-NOT-EXPORT'}],[]);
  const html=context.completedMachinesReportHtml(report);
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('DO-NOT-EXPORT'));
});
test('dashboard and printable report use the same totals and the snapshot time in Bangkok',()=>{
  const {context,document}=portal();context.rows=fixture();
  vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'2026-10-21T00:00:00Z'}",context);
  context.renderCompletionDashboard();
  const report=context.getCompletionReport();
  assert.ok(document.getElementById('completionKpis').innerHTML.includes('40%'));
  assert.equal(document.getElementById('completionMachineBody').innerHTML,context.completionMachineRows(report));
  assert.ok(context.completionTimestamp(report.updatedAt).includes('07:00'));
  assert.ok(context.completionReportHtml(report).includes('40%'));
});
test('each report requires loaded data and opens the shared inline print preview',async()=>{
 const {context}=portal();let opened=0;context.openReportPrintPreview=()=>{opened++;return Promise.resolve(true);};context.printCompletionReport();context.printCompletedMachinesReport();assert.equal(opened,0);
 context.rows=fixture();vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'2026-10-21T00:00:00Z'}",context);await context.printCompletionReport();await context.printCompletedMachinesReport();assert.equal(opened,2);
});
test('progress and completed-machine printouts contain only their own topic, with identical completion counts',async()=>{
 const {context}=portal();const previews=[];context.openReportPrintPreview=(html,title)=>{previews.push({html,title});return Promise.resolve(true);};context.rows=fixture();vm.runInContext("portalData={assetRows:rows,jobWorkRows:[],loadedAt:'2026-10-21T00:00:00Z'}",context);
 await context.printCompletionReport();await context.printCompletedMachinesReport();const [progress,machines]=previews;
 assert.equal(progress.title,'รายงานความคืบหน้าเครื่องที่ติดตั้งเสร็จ');assert.ok(progress.html.includes('ความคืบหน้า'));assert.ok(progress.html.includes('40%'));assert.ok(!progress.html.includes('JOB-2'));assert.ok(!progress.html.includes('รายการเครื่องที่ติดตั้งเสร็จ'));assert.equal((progress.html.match(/<table/g)||[]).length,1);
 assert.equal(machines.title,'รายการเครื่องที่ติดตั้งเสร็จ');assert.ok(machines.html.includes('ติดตั้งเสร็จ 2 เครื่อง'));assert.ok(machines.html.includes('JOB-2'));assert.ok(machines.html.includes('JOB-10'));assert.ok(!machines.html.includes('JOB-3'));assert.ok(!machines.html.includes('ความคืบหน้า'));assert.ok(!machines.html.includes('คงเหลือ'));assert.equal((machines.html.match(/<table/g)||[]).length,1);
});
