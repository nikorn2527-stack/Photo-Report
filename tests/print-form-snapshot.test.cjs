const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function app(){
 let held=false,selected='',reads=0,releases=0,failRead=false;
 const sheet={getRange(...args){if(args[0]==='B4')return {setValue(job){assert.equal(held,true);selected=job;},getFormula(){return '';}};return {getDisplayValues(){assert.equal(held,true,'snapshot must be read before lock release');reads++;if(failRead)throw new Error('read failed');return [[selected]];}};}};
 const spreadsheet={getSheetByName(){return sheet;}};
 const context=vm.createContext({LockService:{getScriptLock(){return {waitLock(){assert.equal(held,false);held=true;},releaseLock(){held=false;releases++;selected='OTHER-JOB';}};}},SpreadsheetApp:{flush(){assert.equal(held,true);}},ScriptApp:{getService(){return {getUrl(){return 'https://example.test/app';}};}}});
 new vm.Script(fs.readFileSync(path.join(__dirname,'..','Code.gs'),'utf8')).runInContext(context);
 context.getSpreadsheet_=()=>spreadsheet;context.getAssetPortalRows_=()=>[{jobNo:'JOB-A'},{jobNo:'JOB-B'}];context.buildSheetEditUrl_=()=> 'https://example.test/sheet';
 return {context,get reads(){return reads;},get releases(){return releases;},set failRead(value){failRead=value;}};
}
test('printed form is captured under the same lock as Job selection, before another Job can replace it',()=>{
 const p=app();for(const type of ['delivery','return']){const result=p.context.getPrintFormData('job-a',type);assert.equal(result.jobNo,'JOB-A');assert.equal(result.values[0][0],'JOB-A');assert.equal(result.formType,type);}assert.equal(p.reads,2);assert.equal(p.releases,2);
});
test('a failed form snapshot releases the lock and the next Job can still print',()=>{
 const p=app();p.failRead=true;assert.throws(()=>p.context.getPrintFormData('JOB-A','return'),/read failed/);assert.equal(p.releases,1);p.failRead=false;const result=p.context.getPrintFormData('JOB-B','return');assert.equal(result.values[0][0],'JOB-B');assert.equal(p.releases,2);
});
test('preparing a form link preserves the public response and does not read a print snapshot unnecessarily',()=>{
 const p=app(),result=p.context.prepareJobForm('JOB-A','delivery');assert.equal(result.jobNo,'JOB-A');assert.ok(result.printUrl.includes('job=JOB-A'));assert.equal(result.values,undefined);assert.equal(p.reads,0);assert.equal(p.releases,1);
});
test('invalid form or unknown Job does not change the shared template',()=>{
 const p=app();assert.throws(()=>p.context.getPrintFormData('JOB-A','unknown'),/ประเภทเอกสาร/);assert.throws(()=>p.context.getPrintFormData('missing','return'),/ไม่พบ Job/);assert.equal(p.reads,0);assert.equal(p.releases,0);
});
