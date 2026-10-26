const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function backend(){
 const values=new Map([['OTHER_SECRET','never-return-this']]),files=new Map();let number=0,created=0,held=false,failImageSave=false;
 const props={getProperty:key=>values.get(key)||null,getProperties:()=>Object.fromEntries(values),setProperty(key,value){if(failImageSave&&key.includes(':image:'))throw new Error('storage full');values.set(key,value);}};
 const folder={getId:()=> 'evidence-folder',createFolder(){return folder;},createFile(blob){assert.equal(held,false,'large file writes must not hold the shared status lock');created++;const id='file-'+created,record={id,blob,trashed:false,getId(){return id;},setTrashed(value){this.trashed=value;},isTrashed(){return this.trashed;},getBlob(){return {getContentType:()=> 'image/jpeg',getBytes:()=>[1,2,3]};}};files.set(id,record);return record;}};
 const context=vm.createContext({PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;},releaseLock(){held=false;}})},DriveApp:{getFolderById:()=>folder,getFileById(id){if(!files.has(id))throw new Error('not found');return files.get(id);}},Utilities:{getUuid:()=> 'report-'+String(++number).padStart(5,'0'),base64Encode:()=> 'AQID'}});
 new vm.Script(fs.readFileSync(path.join(__dirname,'..','Code.gs'),'utf8')).runInContext(context);context.getSpreadsheet_=()=>({getId:()=> 'sheet-1',getSheetByName:()=>({})});context.getAssetPortalRows_=()=>[{jobNo:'JOB-101',building:'B1',floor:'1',department:'Finance',contractNo:'C1',windowsKey:'PRIVATE'}];context.dataUrlToImageBlob_=(data,name)=>({data,name});
 return {context,values,files,get created(){return created;},set failImageSave(value){failImageSave=value;}};
}
function page(){const document={getElementById:()=>({value:'missing-complete'})};const context=vm.createContext({document,window:{addEventListener(){}}});new vm.Script(fs.readFileSync(path.join(__dirname,'..','Portal.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace(/<\?!=[\s\S]*?\?>/g,'"dashboard"')).runInContext(context);return context;}
const meta={category:'sticker',title:'ตำแหน่งสติกเกอร์',notes:'ด้านหลังเครื่อง',result:'ภาพประกอบ',position:1};
test('ad hoc reports support project-wide samples without a Job, and bind optional Jobs to canonical location data',()=>{
 const p=backend(),report=p.context.saveEvidenceReport('',{title:'ชุดตัวอย่าง',department:'โครงการ',testDate:''});assert.equal(report.jobNo,'');assert.equal(report.department,'โครงการ');assert.equal(report.testDate,'');const linked=p.context.saveEvidenceReport('',{title:'เครื่องตัวอย่าง',jobNo:'job-101',department:'WRONG',contractNo:'WRONG',testDate:'2026-10-26'});assert.equal(linked.jobNo,'JOB-101');assert.equal(linked.department,'Finance');assert.equal(linked.contractNo,'C1');assert.ok(!JSON.stringify(p.context.listEvidenceReports()).includes('PRIVATE'));assert.ok(!JSON.stringify(p.context.listEvidenceReports()).includes('never-return-this'));
 assert.throws(()=>p.context.saveEvidenceReport('',{title:'test',jobNo:'missing'}),/ไม่พบ Job/);assert.throws(()=>p.context.saveEvidenceReport('',{title:'test',testDate:'2026-02-31'}),/วันที่/);
});
test('original uploads are idempotent, preserve data, and never enter the primary after1 index',()=>{
 const p=backend(),report=p.context.saveEvidenceReport('',{title:'sample'});const one=p.context.uploadEvidenceImage(report.id,'upload-0001','original-full-bytes','original.jpg',meta),two=p.context.uploadEvidenceImage(report.id,'upload-0001','retry-data','retry.jpg',meta);assert.equal(one.id,two.id);assert.equal(p.created,1);assert.equal(p.files.get('file-1').blob.data,'original-full-bytes');assert.equal(one.fileId,undefined);assert.equal(p.context.getEvidenceReport(report.id).images.length,1);assert.equal(p.context.getEvidenceImage(report.id,one.id),'data:image/jpeg;base64,AQID');assert.ok(Array.from(p.values.keys()).every(key=>!key.includes('after1')));
});
test('upload and read APIs reject images from another report and invalid categories/results before creating files',()=>{
 const p=backend(),a=p.context.saveEvidenceReport('',{title:'A'}),b=p.context.saveEvidenceReport('',{title:'B'}),image=p.context.uploadEvidenceImage(a.id,'upload-0001','bytes','test.jpg',meta);assert.throws(()=>p.context.getEvidenceImage(b.id,image.id),/รายงานอื่น/);assert.throws(()=>p.context.uploadEvidenceImage(b.id,image.id,'data','b.jpg',meta),/รายงานอื่น/);assert.throws(()=>p.context.uploadEvidenceImage(a.id,'upload-0002','data','b.jpg',{...meta,category:'invalid'}),/ประเภทภาพ/);assert.throws(()=>p.context.uploadEvidenceImage(a.id,'upload-0002','data','b.jpg',{...meta,result:'ติดตั้งเสร็จ'}),/ผลการตรวจ/);assert.equal(p.created,1);
});
test('metadata save failures remove only the newly created orphan file and allow an idempotent retry',()=>{
 const p=backend(),report=p.context.saveEvidenceReport('',{title:'sample'});p.failImageSave=true;assert.throws(()=>p.context.uploadEvidenceImage(report.id,'upload-0001','bytes','a.jpg',meta),/storage full/);assert.equal(p.files.get('file-1').trashed,true);assert.equal(p.context.getEvidenceReport(report.id).images.length,0);p.failImageSave=false;p.context.uploadEvidenceImage(report.id,'upload-0001','bytes','a.jpg',meta);assert.equal(p.context.getEvidenceReport(report.id).images.length,1);assert.equal(p.files.get('file-2').trashed,false);
});
test('editing evidence descriptions retains the original file and does not change other reports',()=>{
 const p=backend(),report=p.context.saveEvidenceReport('',{title:'sample'});const image=p.context.uploadEvidenceImage(report.id,'upload-0001','bytes','a.jpg',meta);const edited=p.context.updateEvidenceImage(report.id,image.id,{...meta,category:'software',result:'ต้องแก้ไข',notes:'ต้องเพิ่มโปรแกรม',position:3});assert.equal(edited.notes,'ต้องเพิ่มโปรแกรม');assert.equal(edited.position,3);assert.equal(p.created,1);assert.equal(p.context.getEvidenceImage(report.id,image.id),'data:image/jpeg;base64,AQID');
});
test('photo audit checks only after1, keeps unknown metadata separate and distinguishes unfinished Jobs',()=>{
 const p=page(),rows=[{jobNo:'A',installStatus:'ติดตั้งเสร็จ'},{jobNo:'B',installStatus:'ติดตั้งเสร็จ'},{jobNo:'C',installStatus:'ติดตั้งเสร็จ'},{jobNo:'D',installStatus:'รอดำเนินการ'}],work=[{jobNo:'a',hasAfterPhoto:true,primaryPhotoComplete:false},{jobNo:'B',hasAfterPhoto:false,totalPhotoCount:8},{jobNo:'D',hasAfterPhoto:false}];
 const missing=p.reportPhotoAudit(rows,work,'missing-complete');assert.deepEqual(Array.from(missing,r=>[r.jobNo,r.photoState]),[['B','missing'],['C','unknown']]);assert.deepEqual(Array.from(p.reportPhotoAudit(rows,work,'all-jobs'),r=>r.jobNo),['B','C','D']);assert.equal(p.reportPhotoAudit(rows,work,'all-photos').length,3);assert.equal(rows[1].photoState,undefined);
});
test('supplemental report prints chosen sample evidence with explicit results without inventing a passed test',()=>{
 const p=page(),items=[{metadata:{...meta,id:'a',position:1,result:'',title:'USB Hub'},data:'original-a'},{metadata:{...meta,id:'b',position:2,result:'ต้องแก้ไข',notes:'<check>'},data:'original-b'},{metadata:{...meta,id:'c',position:3,result:'ผ่าน'},data:'original-c'}],html=p.evidenceReportPrintHtml({title:'<ชุดตัวอย่าง>',notes:'หมายเหตุ',jobNo:'',testDate:''},items,2);assert.equal((html.match(/class="executive-photo-page executive-photo-form evidence-print-form evidence-photos-2"/g)||[]).length,2);assert.equal((html.match(/<img /g)||[]).length,3);assert.ok(html.includes('ต้องแก้ไข'));assert.ok(html.includes('&lt;check&gt;'));assert.ok(!html.includes('<ชุดตัวอย่าง>'));assert.ok(!html.includes('ผลการทดสอบ:</strong> ผ่านการทดสอบ'));assert.ok(html.includes('ผู้ตรวจสอบ'));
});

test('long descriptions use two images per page with repeated form headers and short descriptions can use four',()=>{
 const p=page(),items=Array.from({length:4},(_,i)=>({metadata:{...meta,position:i+1,notes:'ตรวจตำแหน่ง '.repeat(15)},data:'original'}));assert.equal(p.evidencePageSize({title:'sample'},items,4),2);let html=p.evidenceReportPrintHtml({title:'sample'},items,4);assert.equal((html.match(/class="photo-form-header"/g)||[]).length,2);
 items.forEach(i=>i.metadata.notes='ตรวจแล้ว');assert.equal(p.evidencePageSize({title:'sample'},items,4),4);html=p.evidenceReportPrintHtml({title:'sample'},items,4);assert.equal((html.match(/class="photo-form-header"/g)||[]).length,1);assert.ok(p.evidenceTestDateLabel('2026-10-26').includes('2569'));assert.equal(p.evidenceTestDateLabel(''),'');
});

test('photo audit links can open the exact requested Job without changing normal upload-page selection',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','Sidebar.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],selected=[];
 const context=vm.createContext({document:{addEventListener(){},getElementById(){return {addEventListener(){}};}},window:{addEventListener(){}},google:{script:{url:{getLocation(callback){callback({parameter:{job:'job-104'}});}}}}});new vm.Script(source).runInContext(context);context.selectJob=index=>selected.push(index);vm.runInContext("jobs=[{jobNo:'JOB-101'},{jobNo:'JOB-104'}]",context);context.openRequestedReportJob();assert.deepEqual(selected,[1]);context.google.script.url.getLocation=callback=>callback({parameter:{job:'missing'}});context.openRequestedReportJob();assert.deepEqual(selected,[1]);delete context.google.script.url;assert.doesNotThrow(()=>context.openRequestedReportJob());
});

test('six-photo evidence forms paginate six per page and keep escaped captions below each photograph',()=>{
 const p=page(),items=Array.from({length:7},(_,i)=>({data:'photo-'+i,metadata:{position:i+1,category:'other',fileName:'IMG_'+i+'.jpg',title:'IMG_'+i+'.jpg',notes:'คำอธิบาย <'+i+'>',result:''}}));assert.equal(p.evidencePageSize({title:'sample'},items,6),6);const html=p.evidenceReportPrintHtml({title:'sample'},items,6);assert.equal((html.match(/evidence-print-form evidence-photos-6"/g)||[]).length,2);assert.equal((html.match(/<img /g)||[]).length,7);for(let i=0;i<items.length;i++){assert.ok(html.includes('คำอธิบาย &lt;'+i+'&gt;'));assert.ok(html.indexOf('src="photo-'+i+'"')<html.indexOf('คำอธิบาย &lt;'+i+'&gt;'));}assert.ok(html.includes('ภาพที่ 1'));assert.ok(!html.includes('<strong>IMG_0.jpg</strong>'));
});
test('long captions fall back to a readable layout while preserving all evidence and caption text',()=>{
 const p=page(),items=Array.from({length:6},(_,i)=>({data:'photo-'+i,metadata:{...meta,position:i+1,title:'ภาพตัวอย่าง',notes:'รายละเอียดการตรวจสอบ '.repeat(8)}}));assert.equal(p.evidencePageSize({title:'sample'},items,6),2);const html=p.evidenceReportPrintHtml({title:'sample'},items,6);assert.equal((html.match(/<img /g)||[]).length,6);assert.equal((html.match(/class="photo-form-header"/g)||[]).length,3);assert.ok(html.includes(items[0].metadata.notes));
});


test('project evidence form omits Job and location while retaining editable title and per-image captions',()=>{
 const p=page(),html=p.evidenceReportPrintHtml({title:'รายงานแสดงส่วนประกอบอุปกรณ์และซอฟต์แวร์ประจำเครื่อง',jobNo:'PRIVATE-JOB',department:'PRIVATE-LOCATION'},[{data:'image',metadata:{...meta,position:1,title:'USB Hub',notes:'ติดตั้งด้านข้างเครื่อง'}}],6);
 assert.ok(html.includes('รายงานแสดงส่วนประกอบอุปกรณ์และซอฟต์แวร์ประจำเครื่อง'));assert.ok(html.includes('ติดตั้งด้านข้างเครื่อง'));
 assert.doesNotMatch(html,/PRIVATE-JOB|PRIVATE-LOCATION|Job เครื่องตัวอย่าง:|หน่วยงาน:|S\/N|วันที่ตรวจ \/ ทดสอบ:|เลขที่สัญญา:/);
});
