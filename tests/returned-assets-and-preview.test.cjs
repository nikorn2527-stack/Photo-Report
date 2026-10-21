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
 assert.equal(report.comCount,2);assert.equal(report.upsCount,2);assert.equal(report.both,2);assert.equal(report.recorded,3);
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
