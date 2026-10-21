const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','Sidebar.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function page(store=new Map()) {
 const elements=new Map(),events=new Map(),docEvents=new Map();let id=0;
 const document={visibilityState:'visible',getElementById(name){if(!elements.has(name))elements.set(name,{hidden:false,innerHTML:'',textContent:'',className:'',value:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){}});return elements.get(name);},addEventListener:(name,callback)=>docEvents.set(name,callback)};
 const window={addEventListener:(name,callback)=>events.set(name,callback),setTimeout,clearTimeout};
 const context=vm.createContext({window,document,navigator:{onLine:true},crypto:{randomUUID:()=> 'task-000000000000-'+(++id)}});
 new vm.Script(script).runInContext(context);
 context.uploadQueueStorage=async(action,value)=>{if(action==='getAll')return [...store.values()].map(row=>structuredClone(row));if(action==='put')store.set(value.id,structuredClone(value));if(action==='delete')store.delete(value);};
 context.readFileAsDataUrl=async blob=>'data:image/jpeg;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');
 vm.runInContext("currentJob={jobNo:'JOB-001',location:'Room'};currentProgress={filledTypes:[],missingTypes:[]}",context);
 const file=Object.assign(new Blob(['original-phone-bytes'],{type:'image/jpeg'}),{name:'phone.jpg'});
 return {context,document,events,docEvents,store,file};
}
test('queue sends one original at a time and counts completion only after server acknowledgment',async()=>{
 const p=page(),first=deferred(),second=deferred(),calls=[];
 p.context.uploadOneForJob=(...args)=>{calls.push(args);return calls.length===1?first.promise:second.promise;};
 await p.context.initializeUploadQueue();
 await p.context.enqueueOriginalUpload('JOB-001','Room','before1',p.file);
 await p.context.enqueueOriginalUpload('JOB-001','Room','before2',p.file);await tick();
 assert.equal(calls.length,1);assert.equal(p.context.isFilled('before1'),false);
 assert.equal(vm.runInContext('uploadSavedCount',p.context),0);
 assert.ok(p.document.getElementById('uploadSummaryTitle').textContent.includes('อย่าปิดจอ'));
 first.resolve('saved');await tick();assert.equal(calls.length,2);
 assert.equal(p.context.isFilled('before1'),true);assert.equal(p.context.isFilled('before2'),false);
 second.resolve('saved');await tick();
 assert.equal(p.store.size,0);assert.equal(vm.runInContext('uploadSavedCount',p.context),2);
 assert.ok(p.document.getElementById('uploadSummaryTitle').textContent.includes('ปิดหน้านี้ได้'));
 assert.equal(Buffer.from(calls[0][3].split(',')[1],'base64').toString(),'original-phone-bytes');
});
test('failure retains the original in durable storage and retry reuses the request ID',async()=>{
 const p=page(),calls=[];p.context.uploadOneForJob=(...args)=>{calls.push(args);return calls.length===1?Promise.reject(Error('network disconnected')):Promise.resolve('saved');};
 await p.context.initializeUploadQueue();await p.context.enqueueOriginalUpload('JOB-001','Room','before2',p.file);await tick();
 assert.equal(p.store.size,1);assert.equal(p.context.isFilled('before2'),false);
 assert.equal(vm.runInContext('uploadTasks[0].state',p.context),'failed');
 assert.ok(!p.document.getElementById('retryUploadsButton').hidden);
 await p.context.retryPendingUploads();await tick();
 assert.equal(calls[0][6],calls[1][6]);assert.equal(p.store.size,0);assert.equal(p.context.isFilled('before2'),true);
});
test('opening the page again restores the queued original and its stable request ID',async()=>{
 const store=new Map(),first=page(store),pending=deferred();let oldId;
 first.context.uploadOneForJob=(...args)=>{oldId=args[6];return pending.promise;};
 await first.context.initializeUploadQueue();await first.context.enqueueOriginalUpload('JOB-001','Room','after4',first.file);await tick();
 const second=page(store),calls=[];second.context.uploadOneForJob=(...args)=>{calls.push(args);return Promise.resolve('saved');};
 await second.context.initializeUploadQueue();await tick();
 assert.equal(calls.length,1);assert.equal(calls[0][6],oldId);assert.equal(calls[0][2],'after4');
 assert.equal(second.context.isFilled('after4'),true);assert.equal(store.size,0);
});
test('switching jobs during an upload cannot mark the other job as complete',async()=>{
 const p=page(),pending=deferred();p.context.uploadOneForJob=()=>pending.promise;
 await p.context.initializeUploadQueue();await p.context.enqueueOriginalUpload('JOB-001','Room','before2',p.file);await tick();
 vm.runInContext("currentJob={jobNo:'JOB-002',location:'Other'};currentProgress={filledTypes:[]}",p.context);
 pending.resolve('saved');await tick();assert.equal(p.context.isFilled('before2'),false);
 vm.runInContext("currentJob={jobNo:'JOB-001'};currentProgress={filledTypes:[]}",p.context);p.context.syncCurrentUploadState();assert.equal(p.context.isFilled('before2'),true);
});
test('unsupported browser storage is disclosed and leaving with unfinished work requests a warning',async()=>{
 const p=page(),pending=deferred();p.context.uploadQueueStorage=async()=>{throw Error('quota exceeded');};p.context.uploadOneForJob=()=>pending.promise;
 await p.context.initializeUploadQueue();await p.context.enqueueOriginalUpload('JOB-001','Room','before1',p.file);await tick();
 assert.ok(p.document.getElementById('uploadSummaryNote').textContent.includes('เก็บคิวในเครื่องไม่ได้'));
 let prevented=false;const event={preventDefault(){prevented=true;}};p.events.get('beforeunload')(event);assert.equal(prevented,true);assert.equal(event.returnValue,'');
 pending.resolve('saved');await tick();
});
test('offline queue waits for connectivity without claiming an upload is complete',async()=>{
 const p=page(),calls=[];p.context.navigator.onLine=false;p.context.uploadOneForJob=(...args)=>{calls.push(args);return Promise.resolve('saved');};
 await p.context.initializeUploadQueue();await p.context.enqueueOriginalUpload('JOB-001','Room','before3',p.file);await tick();
 assert.equal(calls.length,0);assert.ok(p.document.getElementById('uploadSummaryTitle').textContent.includes('ไม่มีอินเทอร์เน็ต'));
 p.context.navigator.onLine=true;await p.context.retryPendingUploads();await tick();assert.equal(calls.length,1);assert.equal(p.context.isFilled('before3'),true);
});
