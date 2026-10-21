const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','Portal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/<\?!=[\s\S]*?\?>/g,'"dashboard"');
function page(){
 const elements=new Map(),frames=[];
 function element(){return {innerHTML:'',textContent:'',disabled:false,hidden:false,value:'0',style:{},classList:{add(){},remove(){},toggle(){}},querySelectorAll(selector){return selector==='img'?[]:frames;}};}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelectorAll(){return [];}};
 const window={addEventListener(){},setTimeout,clearTimeout};
 const context=vm.createContext({document,window});new vm.Script(source).runInContext(context);
 return {context,document,window,frames};
}
test('returned assets use old inventory numbers only, deduplicate per type, and retain partial returns',()=>{
 const {context}=page();
 const rows=[{jobNo:'JOB-1',oldComSn:' COM-001 ',oldUpsSn:'UPS-01',building:'A'},{jobNo:'JOB-2',oldComSn:'com-001',oldUpsSn:'UPS-02',building:'B'},{jobNo:'JOB-3',oldComSn:'COM-002',oldUpsSn:'',building:'A'},{jobNo:'JOB-4',aioSn:'NEW-COM-999',upsSn:'NEW-UPS-999',building:'A'}];
 const before=JSON.stringify(rows),report=context.buildReturnAssetReportData(rows,'2026-10-21T00:00:00Z');
 assert.equal(report.comCount,2);assert.equal(report.upsCount,2);assert.equal(report.recorded,3);
 assert.equal(report.missingCom,1);assert.equal(report.missingUps,2);assert.equal(report.duplicates.length,1);
 assert.equal(report.duplicates[0].type,'คอมพิวเตอร์');assert.equal(report.duplicates[0].jobs.length,2);
 assert.equal(JSON.stringify(rows),before);
 const html=context.returnAssetReportHtml(report);assert.ok(!html.includes('NEW-COM-999'));assert.ok(html.includes('COM-001'));assert.ok(html.includes('<title>รายงานเลขครุภัณฑ์รับคืน</title>'));
});
test('inventory numbers preserve leading zeros and safely escape report contents',()=>{
 const {context}=page(),report=context.buildReturnAssetReportData([{jobNo:'<script>x</script>',oldComSn:'00123',oldUpsSn:'<img onerror=bad>'}]);
 const html=context.returnAssetReportHtml(report);assert.ok(html.includes('00123'));assert.ok(html.includes('&lt;img onerror=bad&gt;'));assert.ok(!html.includes('<script>'));
 assert.equal(context.buildReturnAssetReportData([]).comCount,0);
});
test('per-image zoom is bounded and only updates the chosen label photo',()=>{
 const p=page(),selected={style:{}},other={style:{cssText:'original'}};
 p.frames.push({getAttribute:()=> 'before2',querySelector:()=>selected},{getAttribute:()=> 'before1',querySelector:()=>other});
 vm.runInContext("workPreviewRow={jobNo:'JOB-1'};activeWorkPhotoType='before2';workPreviewImages={before1:'machine-original',before2:'label-original'}",p.context);
 p.document.getElementById('workPhotozoom').value='4';p.document.getElementById('workPhotox').value='-10';p.document.getElementById('workPhotoy').value='15';
 p.context.saveWorkPhotoAdjust();
 assert.ok(selected.style.cssText.includes('scale(4)'));assert.equal(other.style.cssText,'original');
 assert.equal(vm.runInContext('workPreviewImages.before2',p.context),'label-original');
 assert.equal(vm.runInContext("workPhotoAdjustments.has('JOB-1::before1')",p.context),false);
 const bounded=p.context.workPhotoTransform({zoom:99,x:-300,y:'bad'});assert.equal(bounded.zoom,8);assert.equal(bounded.x,-100);assert.equal(bounded.y,0);
});
test('Portal preview preserves the department header and compacts only before/after source slots',()=>{
 const p=page();p.context.renderWorkPrintTemplate({jobNo:'JOB-1',location:'Room'},{images:{before2:'label-original',before4:'ups-label-original',after3:'after-original'},date:'2026-10-21'});
 const html=p.document.getElementById('workPrintPage').innerHTML;
 assert.ok(html.includes('ป้ายชื่อหน่วยงาน'));assert.ok(html.includes('ยังไม่มีรูปป้ายหน่วยงาน'));
 assert.ok(html.includes('ก่อนติดตั้ง 1'));assert.ok(html.includes('ก่อนติดตั้ง 2'));assert.ok(html.includes('หลังติดตั้ง 1'));assert.ok(!html.includes('ก่อนติดตั้ง 4'));
 assert.equal((html.match(/data-work-photo=/g)||[]).length,3);
 assert.ok(html.includes('ปรับป้ายครุภัณฑ์'));assert.ok(html.includes('label-original'));
});
test('Portal loads full originals, keeps print disabled until ready, and ignores a closed preview',async()=>{
 const p=page(),requests=[];
 vm.runInContext("portalData.jobWorkRows=[{jobNo:'JOB-1',location:'Room'}]",p.context);
 p.context.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(failure){return {getPhotoPrintImages(){success({imageTypes:['before2','before4'],date:'2026-10-21'});},getPhotoPrintImage(job,type){requests.push({success,type});}};}};}}}};
 p.context.openWorkPrintPreview('JOB-1');assert.equal(p.document.getElementById('workPrintButton').disabled,true);
 assert.equal(requests.length,2);requests[0].success('data:image/jpeg;base64,AQID');requests[1].success('data:image/jpeg;base64,BAUG');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(p.document.getElementById('workPrintButton').disabled,false);
 assert.ok(p.document.getElementById('workPrintPage').innerHTML.includes('data:image/jpeg;base64,BAUG'));
 p.context.openWorkPrintPreview('JOB-1');p.context.closeWorkPrintPreview();
 requests[2].success('late-image');requests[3].success('late-image');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(vm.runInContext('workPrintReady',p.context),false);
});

test('blank means no returned machine, while ไม่มี and ไม่มีเลข each mean a returned machine without a number',()=>{
 const {context}=page();
 for(const value of ['',null,undefined,'  '])assert.equal(context.classifyReturnedAsset(value).received,false);
 for(const value of ['ไม่มี',' ไม่มีเลข ','ไม่มี เลข']){
  const state=context.classifyReturnedAsset(value);assert.equal(state.received,true);assert.equal(state.noNumber,true);assert.equal(state.number,'');
 }
 assert.equal(context.classifyReturnedAsset('00123').number,'00123');
 assert.equal(context.returnAssetLabel(''),'');
 assert.equal(context.returnAssetLabel('ไม่มี'),'รับคืน ไม่มีเลขครุภัณฑ์');
});
test('anonymous returned machines are counted per row, separately from unique numbered machines and duplicate warnings',()=>{
 const {context}=page();
 const rows=[{jobNo:'JOB-1',oldComSn:'ไม่มี',oldUpsSn:'ไม่มีเลข'},{jobNo:'JOB-2',oldComSn:'ไม่มีเลข',oldUpsSn:''},{jobNo:'JOB-3',oldComSn:'',oldUpsSn:'ไม่มี'},{jobNo:'JOB-4',oldComSn:'00123',oldUpsSn:'UPS-1'},{jobNo:'JOB-5',oldComSn:'00123',oldUpsSn:'UPS-2'},{jobNo:'JOB-6',oldComSn:'',oldUpsSn:''}];
 const report=context.buildReturnAssetReportData(rows);
 assert.equal(report.comCount,3);assert.equal(report.comWithNumber,1);assert.equal(report.comWithoutNumber,2);
 assert.equal(report.upsCount,4);assert.equal(report.upsWithNumber,2);assert.equal(report.upsWithoutNumber,2);
 assert.equal(report.missingCom,2);assert.equal(report.missingUps,2);assert.equal(report.recorded,5);
 assert.equal(report.groups[0].com,3);assert.equal(report.groups[0].ups,4);assert.equal(report.groups[0].comWithoutNumber,2);
 assert.equal(report.duplicates.length,1);assert.equal(report.duplicates[0].number,'00123');
});
test('dashboard and PDF explain all three return states and include unnumbered returns in the totals',()=>{
 const p=page();p.context.rows=[{jobNo:'JOB-1',oldComSn:'ไม่มี',oldUpsSn:''},{jobNo:'JOB-2',oldComSn:'',oldUpsSn:'ไม่มีเลข'}];
 vm.runInContext("portalData={assetRows:rows,loadedAt:'2026-10-21T00:00:00Z'}",p.context);
 p.context.renderReturnAssetDashboard();const report=p.context.getReturnAssetReport(),html=p.context.returnAssetReportHtml(report);
 assert.ok(p.document.getElementById('returnAssetKpis').innerHTML.includes('คอมรับคืนทั้งหมด'));
 assert.ok(!p.document.getElementById('returnAssetMachineBody').innerHTML.includes('ไม่มีเครื่องกลับ'));
 assert.ok(p.document.getElementById('returnAssetMachineBody').innerHTML.includes('<td></td>'));
 assert.ok(html.includes('รับคืน ไม่มีเลขครุภัณฑ์'));assert.ok(!html.includes('ไม่มีคอมกลับ'));
 assert.equal(report.comCount,1);assert.equal(report.upsCount,1);assert.equal(report.duplicates.length,0);
});

test('monitor-only returns appear in the report independently from PC and UPS',()=>{
 const {context}=page(),report=context.buildReturnAssetReportData([{jobNo:'JOB-MON',oldMonitorSn:'MON-001',oldComSn:'',oldUpsSn:''}]);
 assert.equal(report.monitorCount,1);assert.equal(report.comCount,0);assert.equal(report.upsCount,0);assert.equal(report.recorded,1);
 assert.equal(report.rows[0].monitorNo,'MON-001');assert.ok(context.returnAssetReportHtml(report).includes('MON-001'));
});
test('PC, monitor and UPS totals independently handle numbered and unnumbered returns',()=>{
 const {context}=page(),report=context.buildReturnAssetReportData([{jobNo:'1',oldComSn:'PC1',oldMonitorSn:'M1',oldUpsSn:'U1'},{jobNo:'2',oldMonitorSn:'ไม่มี'},{jobNo:'3',oldComSn:'ไม่มีเลข',oldMonitorSn:'ไม่มีเลข',oldUpsSn:'ไม่มี'},{jobNo:'4',oldComSn:'PC1',oldMonitorSn:'M1'},{jobNo:'5',oldUpsSn:'U1'}]);
 assert.equal(report.comCount,2);assert.equal(report.monitorCount,3);assert.equal(report.upsCount,2);
 assert.equal(report.monitorWithNumber,1);assert.equal(report.monitorWithoutNumber,2);assert.equal(report.missingMonitor,1);
 assert.equal(report.duplicates.length,3);
 assert.equal(report.groups[0].monitor,3);
 assert.ok(report.duplicates.some(item=>item.type==='จอมอนิเตอร์'&&item.number==='M1'));
});

test('a returned monitor identifies a PC, including monitors returned without an asset number',()=>{
 const {context}=page();
 for(const monitor of ['MON-001','ไม่มี','ไม่มีเลข'])assert.equal(context.returnedMachineType({oldComSn:'COM-001',oldMonitorSn:monitor}),'PC');
 assert.equal(context.returnedMachineType({oldComSn:'',oldMonitorSn:'MON-001'}),'รับคืนเฉพาะจอ — กรุณาตรวจสอบ');
 assert.equal(context.returnedMachineType({type:'AIO',oldComSn:'COM-001',oldMonitorSn:'MON-001'}),'PC');
 assert.equal(context.returnedMachineType({oldComSn:'COM-001',oldMonitorSn:''}),'AIO');
 const report=context.buildReturnAssetReportData([{jobNo:'JOB-PC',oldComSn:'COM-001',oldMonitorSn:'ไม่มีเลข'}]);
 assert.equal(report.rows[0].machineType,'PC');assert.ok(context.returnAssetMachineRows(report).includes('<td>PC</td>'));
});


test('confirmed rule classifies computers without returned monitors as AIO, including unnumbered computers',()=>{
 const {context}=page();
 for(const computer of ['COM-001','ไม่มี','ไม่มีเลข'])assert.equal(context.returnedMachineType({oldComSn:computer,oldMonitorSn:''}),'AIO');
 assert.equal(context.returnedMachineType({oldComSn:'',oldMonitorSn:'',oldUpsSn:'UPS-001'}),'');
 const report=context.buildReturnAssetReportData([{jobNo:'JOB-AIO',oldComSn:'ไม่มีเลข',oldMonitorSn:''}]);
 assert.equal(report.rows[0].machineType,'AIO');assert.ok(context.returnAssetReportHtml(report).includes('<td>AIO</td>'));
});

test('report navigation follows filtered jobs, handles endpoints, and preserves per-job image edits',()=>{
 const p=page();p.document.getElementById('workSearch').value='NAV';p.document.getElementById('workStatusFilter').value='';
 vm.runInContext("portalData.jobWorkRows=[{jobNo:'JOB-NAV-1',location:'Room'},{jobNo:'JOB-OTHER',location:'Other'},{jobNo:'JOB-NAV-2',location:'Room'},{jobNo:'JOB-NAV-3',location:'Room'}]",p.context);
 p.context.google={script:{run:{withSuccessHandler(){return {withFailureHandler(){return {getPhotoPrintImages(){}};}};}}}};
 p.context.openWorkPrintPreview('JOB-NAV-1');
 assert.equal(p.document.getElementById('workPrintPosition').textContent,'ใบงาน 1 / 3');assert.equal(p.document.getElementById('workPrintPrevious').disabled,true);
 vm.runInContext("workPhotoAdjustments.set('JOB-NAV-1::before1',{zoom:3,x:10,y:5})",p.context);
 p.context.navigateWorkPrintPreview(1);assert.equal(vm.runInContext('workPreviewRow.jobNo',p.context),'JOB-NAV-2');
 p.context.navigateWorkPrintPreview(1);assert.equal(vm.runInContext('workPreviewRow.jobNo',p.context),'JOB-NAV-3');assert.equal(p.document.getElementById('workPrintNext').disabled,true);
 p.context.navigateWorkPrintPreview(1);assert.equal(vm.runInContext('workPreviewRow.jobNo',p.context),'JOB-NAV-3');
 p.context.navigateWorkPrintPreview(-1);p.context.navigateWorkPrintPreview(-1);assert.equal(vm.runInContext('workPreviewRow.jobNo',p.context),'JOB-NAV-1');
 assert.equal(vm.runInContext("workPhotoAdjustments.get('JOB-NAV-1::before1').zoom",p.context),3);
 assert.equal(p.document.getElementById('workPrintButton').disabled,true);
});
test('late loading from the previous report cannot overwrite the next report',async()=>{
 const p=page(),metadata=[],photos=[];
 p.document.getElementById('workSearch').value='';p.document.getElementById('workStatusFilter').value='';
 vm.runInContext("portalData.jobWorkRows=[{jobNo:'JOB-1',location:'First'},{jobNo:'JOB-2',location:'Second'}]",p.context);
 p.context.google={script:{run:{withSuccessHandler(success){return {withFailureHandler(){return {getPhotoPrintImages(job){metadata.push({job,success});},getPhotoPrintImage(job,type){photos.push({job,type,success});}};}};}}}};
 p.context.openWorkPrintPreview('JOB-1');metadata[0].success({imageTypes:['before1']});
 p.context.navigateWorkPrintPreview(1);metadata[1].success({imageTypes:['before1']});
 photos[1].success('job-two-original');await new Promise(resolve=>setImmediate(resolve));
 photos[0].success('stale-job-one-image');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(vm.runInContext('workPreviewRow.jobNo',p.context),'JOB-2');
 assert.equal(vm.runInContext('workPreviewImages.before1',p.context),'job-two-original');
 assert.ok(p.document.getElementById('workPrintPage').innerHTML.includes('job-two-original'));
 assert.ok(!p.document.getElementById('workPrintPage').innerHTML.includes('stale-job-one-image'));
 assert.equal(p.document.getElementById('workPrintButton').disabled,false);
});

 test('blank returns stay empty and unequal component counts have no complete-set KPI in dashboard or PDF',()=>{
 const p=page(),rows=[{jobNo:'PC',oldComSn:'PC-1',oldMonitorSn:'MON-1'},{jobNo:'MON',oldMonitorSn:'ไม่มีเลข'},{jobNo:'UPS',oldUpsSn:'UPS-1'},{jobNo:'EMPTY'}];
 p.context.rows=rows;vm.runInContext("portalData={assetRows:rows,loadedAt:'2026-10-22T00:00:00Z'}",p.context);p.context.renderReturnAssetDashboard();
 const report=p.context.getReturnAssetReport(),html=p.context.returnAssetReportHtml(report);
 assert.equal(report.comCount,1);assert.equal(report.monitorCount,2);assert.equal(report.upsCount,1);assert.equal(report.recorded,3);
 assert.equal(p.context.returnSnCell({oldComSn:''}),'');assert.equal(p.context.returnedMachineType({oldUpsSn:'UPS-1'}),'');
 assert.ok(p.context.returnAssetMachineRows(report).includes('<td>PC</td><td>PC-1</td><td>MON-1</td><td></td>'));
 for(const output of [html,p.document.getElementById('returnAssetKpis').innerHTML,p.context.returnAssetAreaHeaders(),p.context.returnAssetAreaRows(report)]) {
  assert.doesNotMatch(output,/คืนครบ|รับครบ|ไม่มีเครื่องกลับ|ไม่มีคอมกลับ/);
 }
 assert.equal((p.context.returnAssetAreaHeaders().match(/<th>/g)||[]).length,10);
 assert.equal((p.context.returnAssetAreaRows(report).match(/<td>/g)||[]).length,10);
 assert.ok(html.includes('รับคืน ไม่มีเลขครุภัณฑ์'));assert.ok(!html.includes('<td>EMPTY</td>'));
 });
