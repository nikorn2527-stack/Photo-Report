const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'Sidebar.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function image(complete = false, naturalWidth = 0) {
  const listeners = new Map();
  return { complete, naturalWidth,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    emit(name) { if (name === 'load') this.naturalWidth = 1000; listeners.get(name)?.(); }
  };
}
function browser() {
  const elements = new Map();
  let success, failure, printed = 0;
  const page = { imgs: [], innerHTML: '<img>', querySelectorAll() { return this.imgs; }, addEventListener() {} };
  elements.set('printPage', page);
  elements.set('includePrintDetails', {checked:true});
  elements.set('printDocument', {querySelectorAll:() => page.imgs, get innerHTML() { return '<article class="print-page">'+page.innerHTML+'</article>'+(elements.get('printDetails')?.innerHTML || ''); }});
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { disabled: false, textContent: '', classList: { add() {}, remove() {} }, addEventListener() {} });
      return elements.get(id);
    },
    querySelectorAll: () => [], addEventListener() {}
  };
  const window = { setTimeout, clearTimeout, addEventListener() {}, print() { printed++; } };
  const runner = { withSuccessHandler(callback) { success = callback; return this; }, withFailureHandler(callback) { failure = callback; return this; }, getPhotoPrintImages() {}, getPhotoPrintImage() { success('data:image/jpeg;base64,AQID'); } };
  const context = vm.createContext({ document, window, google: { script: { run: runner } } });
  new vm.Script(script, { filename: 'Sidebar.html' }).runInContext(context);
  return { context, window, document, elements, page, resolve: data => success(data), reject: error => failure(error), printed: () => printed };
}

test('printing waits for every image, rejects broken images, and accepts cached images', async () => {
  const b = browser(), first = image(), second = image();
  let done = false;
  const waiting = b.context.waitForPrintImages({ querySelectorAll: () => [first, second] }).then(() => { done = true; });
  first.emit('load'); await Promise.resolve(); assert.equal(done, false);
  second.emit('load'); await waiting; assert.equal(done, true);
  await b.context.waitForPrintImages({ querySelectorAll: () => [image(true, 1000)] });
  await assert.rejects(b.context.waitForPrintImages({ querySelectorAll: () => [image(true, 0)] }), /โหลดไม่สำเร็จ/);
  const broken = image(), failed = b.context.waitForPrintImages({ querySelectorAll: () => [broken] });
  broken.emit('error'); await assert.rejects(failed, /โหลดไม่สำเร็จ/);
});

test('print button stays disabled until RPC image data has finished loading', async () => {
  const b = browser(), photo = image(); b.page.imgs = [photo];
  vm.runInContext("currentJob = {jobNo:'JOB-001',location:'Room'}", b.context);
  b.context.openPrintTemplate(); assert.equal(b.document.getElementById('printNowButton').disabled, true);
  b.resolve({ imageTypes: ['before1'], date: '2026-10-21' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.document.getElementById('printNowButton').disabled, true);
  photo.emit('load'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.document.getElementById('printNowButton').disabled, false);
  assert.ok(b.page.innerHTML.includes('data:image/jpeg;base64,AQID'));
});

test('closing the preview ignores an old RPC response and uploading photos blocks preview', () => {
  const b = browser(); vm.runInContext("currentJob = {jobNo:'JOB-001',location:'Room'}", b.context);
  b.context.openPrintTemplate(); b.context.closePrintPreview();
  b.resolve({ images: { before1: 'data:image/jpeg;base64,AQID' } });
  assert.equal(b.document.getElementById('printNowButton').disabled, true);
  vm.runInContext("uploadStates = {before1:'pending'}", b.context);
  b.context.openPrintTemplate(); assert.ok(b.document.getElementById('status').textContent.includes('รอให้อัปโหลด'));
});

test('a popup prints only after its own images have loaded', async () => {
  const b = browser(), photo = image(); let printed = 0;
  const popup = { closed: false, opener: {}, document: { open() {}, write() {}, close() {}, querySelectorAll: () => [photo] }, focus() {}, print() { printed++; }, close() { this.closed = true; } };
  b.window.open = () => popup; vm.runInContext('printReady = true', b.context);
  b.context.printNow(); assert.equal(printed, 0); assert.equal(popup.opener, null);
  photo.emit('load'); await new Promise(resolve => setImmediate(resolve)); assert.equal(printed, 1);
});


test('appendices contain full-size original images and job labels, and can be disabled', () => {
  const b = browser();
  vm.runInContext("currentJob = {jobNo:'JOB-001',location:'Room <1>'}; printImages = {before1:'data:image/jpeg;base64,AQID', after2:'data:image/jpeg;base64,BAUG'}", b.context);
  b.context.renderPrintDetails();
  const details = b.document.getElementById('printDetails').innerHTML;
  assert.equal((details.match(/class="print-detail-page"/g) || []).length, 2);
  assert.ok(details.includes('JOB-001')); assert.ok(details.includes('Room &lt;1&gt;'));
  assert.ok(details.includes('data:image/jpeg;base64,AQID'));
  b.document.getElementById('includePrintDetails').checked = false;
  b.context.renderPrintDetails();
  assert.equal(b.document.getElementById('printDetails').innerHTML, '');
});
