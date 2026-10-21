const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function app(){const context=vm.createContext({});new vm.Script(fs.readFileSync(path.join(__dirname,'..','Code.gs'),'utf8')).runInContext(context);return context;}
test('legacy monitor asset numbers are read from AJ while PC and UPS retain their original columns',()=>{
 const context=app(),row=Array(37).fill('');row[0]='JOB-1';row[27]='PC-001';row[28]='UPS-001';row[34]='HUB-KEEP';row[35]='MON-001';row[36]=true;
 const sheet={getLastRow:()=>4,getRange(start,col,count,width){assert.equal(start,4);assert.equal(width,36);return {getValues:()=>[row.slice(0,width)]};}};
 const result=context.getAssetPortalRows_(sheet)[0];assert.equal(result.oldMonitorSn,'MON-001');assert.equal(result.oldComSn,'PC-001');assert.equal(result.oldUpsSn,'UPS-001');assert.equal(row[34],'HUB-KEEP');assert.equal(row[36],true);
});
test('saving from older clients preserves the monitor field; explicit monitor changes only write AJ',()=>{
 const context=app(),writes=[],sheet={getRange(row,col){return {setValue(value){writes.push({row,col,value});}};}};
 context.saveReturnedMonitor_(sheet,4,{oldComSn:'PC-NEW'});assert.equal(writes.length,0);
 context.saveReturnedMonitor_(sheet,4,{oldMonitorSn:'MON-002'});context.saveReturnedMonitor_(sheet,4,{oldMonitorSn:''});
 assert.deepEqual(writes,[{row:4,col:36,value:'MON-002'},{row:4,col:36,value:''}]);
});
test('monitor header restoration leaves adjacent legacy Hub and no-return columns intact',()=>{
 const context=app(),headers=new Map([[35,'S/N Hub USB'],[36,'S/N จอเดิม'],[37,'ไม่มีเครื่องเดิมให้นำกลับ']]);
 const sheet={getMaxColumns:()=>37,getRange(row,col){return {getDisplayValue:()=>headers.get(col)||'',setValue(value){headers.set(col,value);}};}};
 context.ensurePreparationStatusColumn_(sheet);assert.equal(headers.get(36),'เลขครุภัณฑ์จอมอนิเตอร์');assert.equal(headers.get(35),'S/N Hub USB');assert.equal(headers.get(37),'ไม่มีเครื่องเดิมให้นำกลับ');
 headers.set(36,'Unrelated user column');assert.throws(()=>context.ensurePreparationStatusColumn_(sheet),/AJ/);assert.equal(headers.get(36),'Unrelated user column');
});

test('existing AK no-old-equipment checkbox is read without writing or inserting columns',()=>{
 const context=app(),row=Array(40).fill('');row[0]='JOB-1';row[36]='true';
 const sheet={getLastRow:()=>4,getMaxColumns:()=>40,getRange(start,col,count,width){if(start===3){assert.equal(col,37);return {getDisplayValue:()=> 'ไม่มีเครื่องเดิมให้นำกลับ'};}assert.equal(width,37);return {getValues:()=>[row]};}};
 assert.equal(context.getAssetPortalRows_(sheet)[0].noOldEquipment,true);row[36]='false';assert.equal(context.getAssetPortalRows_(sheet)[0].noOldEquipment,false);
});
test('an unrelated AK column is not interpreted as a no-return flag',()=>{
 const context=app(),row=Array(40).fill('');row[0]='JOB-1';row[36]=true;
 const sheet={getLastRow:()=>4,getMaxColumns:()=>40,getRange(start,col,count,width){if(start===3)return {getDisplayValue:()=> 'ข้อมูลอื่น'};assert.equal(width,36);return {getValues:()=>[row]};}};assert.equal(context.getAssetPortalRows_(sheet)[0].noOldEquipment,null);
});
