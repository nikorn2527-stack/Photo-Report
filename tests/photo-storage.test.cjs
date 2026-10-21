const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function harness() {
  const sheets = new Map(), files = new Map(), createdSheets = [], requests = [];
  let locked = false, sequence = 0;
  function blob(bytes, type = 'image/jpeg') {
    return { getBytes: () => bytes, getContentType: () => type, setName() { return this; } };
  }
  function sheet(name) {
    const data = [], images = [];
    const target = {
      data, images, getName: () => name, getSheetId: () => name === 'Photo_Report' ? 1 : 2,
      getLastRow: () => data.length,
      getLastColumn: () => Math.max(0, ...data.map(row => row.length)),
      getColumnWidth: () => 80, getRowHeight: () => 100,
      setFrozenRows() {}, autoResizeColumns() {},
      getImages: () => images.slice(),
      copyTo() { throw new Error('Must never copy a report sheet'); },
      getDataRange() { return this.getRange(1, 1, Math.max(1, data.length), Math.max(1, this.getLastColumn())); },
      getRange(row, column, rows = 1, columns = 1) {
        let a1;
        if (typeof row === 'string') {
          a1 = row;
          const match = row.match(/^([A-Z]+)(\d+)$/);
          row = Number(match[2]); column = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
        } else {
          let n = column, letters = '';
          while (n) { n--; letters = String.fromCharCode(65 + n % 26) + letters; n = Math.floor(n / 26); }
          a1 = letters + row;
        }
        const range = {
          getValues: () => Array.from({ length: rows }, (_, r) => Array.from({ length: columns }, (_, c) => data[row + r - 1]?.[column + c - 1] ?? '')),
          getDisplayValues() { return this.getValues().map(values => values.map(String)); },
          getDisplayValue() { return String(this.getValues()[0][0]); },
          setValues(values) { values.forEach((values, r) => values.forEach((value, c) => { data[row + r - 1] ||= []; data[row + r - 1][column + c - 1] = value; })); return this; },
          setValue(value) { return this.setValues([[value]]); },
          clearContent() { return this.setValue(''); },
          setFontWeight() { return this; }, setBackground() { return this; },
          getA1Notation: () => a1, getColumn: () => column, getRow: () => row,
          getNumColumns: () => columns, getNumRows: () => rows,
          getMergedRanges: () => [], getCell() { return this; }
        };
        return range;
      },
      insertImage(imageBlob, column, row) {
        const image = {
          blob: imageBlob, anchor: this.getRange(row, column),
          getAnchorCell() { return this.anchor; }, setAnchorCell(cell) { this.anchor = cell; return this; },
          getInherentWidth: () => 2000, getInherentHeight: () => 1500,
          setAltTextTitle() {}, setAltTextDescription() {}, setWidth() {}, setHeight() {},
          setAnchorCellXOffset() {}, setAnchorCellYOffset() {},
          remove() { images.splice(images.indexOf(this), 1); }
        };
        images.push(image); return image;
      }
    };
    sheets.set(name, target); return target;
  }
  const report = sheet('Photo_Report');
  const workbook = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet(name) {
      assert.ok(['Photo_File_Index', 'Photo_PDF_Index'].includes(name), 'unexpected sheet: ' + name);
      createdSheets.push(name); return sheet(name);
    }
  };
  const folder = {
    createFile(imageBlob) {
      const id = 'file_' + String(++sequence).padStart(12, '0');
      const file = { id, name: '', trashed: false, created: sequence,
        getId: () => id, getBlob: () => imageBlob, getName() { return this.name; },
        setName(name) { this.name = name; return this; }, getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
        getDateCreated() { return new Date(this.created * 1000); }, setTrashed(value) { this.trashed = value; }
      };
      files.set(id, file); return file;
    },
    searchFiles() { const values = [...files.values()].filter(file => !file.trashed); return { hasNext: () => values.length > 0, next: () => values.shift() }; }
  };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => workbook, flush() {} },
    DriveApp: { getFolderById: () => folder, getFileById: id => { const file = files.get(id); if (!file || file.trashed) throw new Error('Missing Drive file'); return file; } },
    LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; }, releaseLock() { assert.equal(locked, true); locked = false; } }) },
    Utilities: { base64Decode: value => [...Buffer.from(value, 'base64')], newBlob: (bytes, type) => blob(bytes, type), base64Encode: bytes => Buffer.from(bytes).toString('base64'), formatDate: () => '20261021_120000' },
    ScriptApp: { getOAuthToken: () => 'mock-token' },
    UrlFetchApp: { fetch(url) {
      if (url.includes('/export')) assert.ok(locked, 'PDF export must stay inside the report lock'); requests.push(url);
      if (url.includes('www.googleapis.com')) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ thumbnailLink: 'https://example.test/private-thumbnail=s220' }) };
      return { getResponseCode: () => 200, getBlob: () => url.includes('/export') ? blob([1], 'application/pdf') : blob([1], 'image/jpeg') };
    } }
  });
  new vm.Script(source, { filename: 'Code.gs' }).runInContext(context);
  context.getAssetMasterJobInfo_ = () => ({ location: 'Asset location' });
  const dataUrl = bytes => 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64');
  const upload = (job, type = 'before1', data = dataUrl([1, 2, 3])) => context.uploadImageToSheet(job, 'Room ' + job, type, data, 'phone.jpg', '2026-10-21');
  return { context, workbook, sheets, sheet, report, files, folder, createdSheets, requests, blob, upload, dataUrl, isLocked: () => locked };
}

test('upload/save/reload two jobs without creating report tabs or altering the template', () => {
  const h = harness();
  h.report.getRange('B4').setValue('Existing template');
  h.upload('JOB-001'); h.upload('JOB-002', 'after1');
  h.context.saveJobProgress('JOB-001', 'Updated location', '2026-10-20');
  const first = h.context.getJobProgress('JOB-001'), second = h.context.getJobProgress('JOB-002');
  assert.deepEqual([...first.filledTypes], ['before1']);
  assert.deepEqual([...second.filledTypes], ['after1']);
  assert.equal(first.location, 'Updated location'); assert.equal(first.date, '2026-10-20');
  assert.equal(first.exists, true); assert.equal(h.report.getRange('B4').getDisplayValue(), 'Existing template');
  assert.equal(h.report.images.length, 0);
  assert.deepEqual(h.createdSheets, ['Photo_File_Index']); assert.equal(h.isLocked(), false);
});

test('phone original over 2 MB uploads to Drive without image insertion or thumbnail fetch', () => {
  const h = harness(), bytes = Buffer.alloc(2 * 1024 * 1024 + 1, 3);
  h.upload('JOB-001', 'before1', h.dataUrl(bytes));
  assert.equal([...h.files.values()][0].getBlob().getBytes().length, bytes.length);
  assert.equal(h.report.images.length, 0); assert.equal(h.requests.length, 0);
});

test('replace and delete a photo for a job that has never had a report tab', () => {
  const h = harness(); h.upload('JOB-001'); h.upload('JOB-001');
  assert.equal([...h.files.values()].filter(file => !file.trashed).length, 1);
  const result = h.context.deleteImageFromSheet('JOB-001', 'Room', 'before1', '2026-10-21');
  assert.equal(result.filledTypes.length, 0);
  assert.equal(h.context.getJobProgress('JOB-001').filledCount, 0);
  assert.equal([...h.files.values()].filter(file => !file.trashed).length, 0);
  assert.deepEqual(h.createdSheets, ['Photo_File_Index']);
});

test('printing reuses Photo_Report, removes the previous job images, and locks PDF export', () => {
  const h = harness(); h.upload('JOB-001'); h.upload('JOB-002', 'after1');
  const first = h.context.getJobReportInfo('JOB-001');
  assert.equal(first.sheetName, 'Photo_Report');
  assert.deepEqual([...h.context.getFilledImageTypes_(h.report)], ['before1']);
  const pdf = h.context.createJobPdf('JOB-002');
  assert.equal(pdf.sourceSheetName, 'Photo_Report'); assert.equal(pdf.filledCount, 1);
  assert.equal(h.report.getRange('B4').getDisplayValue(), 'JOB-002');
  assert.deepEqual([...h.context.getFilledImageTypes_(h.report)], ['after1']);
  assert.deepEqual(h.createdSheets, ['Photo_File_Index', 'Photo_PDF_Index']); assert.equal(h.isLocked(), false);
});

test('printing a large phone original uses a private Drive thumbnail within the sheet limit', () => {
  const h = harness(); h.upload('JOB-001', 'before1', h.dataUrl(Buffer.alloc(2 * 1024 * 1024 + 1, 3)));
  h.context.createJobPdf('JOB-001');
  assert.ok(h.requests.some(url => url.includes('fields=thumbnailLink')));
  assert.ok(h.requests.includes('https://example.test/private-thumbnail=s2000'));
  assert.equal(h.report.images[0].blob.getBytes().length, 1);
});

test('extend a legacy 12-column index without clearing its URLs or report references', () => {
  const h = harness();
  const headers = vm.runInContext('CONFIG.PHOTO_FILE_INDEX_HEADERS.slice(0, 12)', h.context);
  const index = h.sheet('Photo_File_Index');
  index.getRange(1, 1, 1, 12).setValues([headers]);
  index.getRange(2, 1, 1, 12).setValues([['old date', 'JOB-OLD', 'REPORT_JOB-OLD', 'https://drive.google.com/file/d/old_file_123456/view', '', '', '', '', '', '', '', '']]);
  h.context.ensurePhotoFileIndexSheet_();
  assert.equal(index.data[1][3], 'https://drive.google.com/file/d/old_file_123456/view');
  assert.equal(index.data[1][2], 'REPORT_JOB-OLD'); assert.equal(index.data[0].length, 14);
});

test('unexpected index headers fail without clearing user data', () => {
  const h = harness(), index = h.sheet('Photo_File_Index');
  index.getRange(1, 1).setValue('Custom data');
  assert.throws(() => h.context.ensurePhotoFileIndexSheet_(), /หัวตาราง/);
  assert.equal(index.data[0][0], 'Custom data');
});

test('legacy reports remain readable and a missing Drive source leaves the shared template intact', () => {
  const h = harness(), legacy = h.sheet('REPORT_JOB-OLD');
  legacy.getRange('D4').setValue('Legacy location'); legacy.insertImage(h.blob([1]), 1, 15);
  h.report.getRange('B4').setValue('Previous document');
  assert.equal(h.context.getJobProgress('JOB-OLD').filledCount, 1);
  assert.throws(() => h.context.getJobReportInfo('JOB-OLD'), /ไม่พบไฟล์ต้นฉบับ/);
  assert.equal(h.report.getRange('B4').getDisplayValue(), 'Previous document');
  assert.equal(legacy.images.length, 1); assert.equal(h.isLocked(), false);
});


test('A4 RPC returns embedded image data for the selected job without changing any report sheet', () => {
  const h = harness(); h.upload('JOB-001'); h.upload('JOB-002', 'after1');
  const result = h.context.getPhotoPrintImages('JOB-001');
  assert.deepEqual([...result.imageTypes], ['before1']);
  assert.equal(h.context.getPhotoPrintImage('JOB-001', 'before1'), 'data:image/jpeg;base64,AQID');
  assert.throws(() => h.context.getPhotoPrintImage('JOB-001', 'after1'), /ไม่พบรูป/);
  assert.equal(result.date, '2026-10-21');
  assert.equal(h.report.images.length, 0);
  assert.deepEqual(h.createdSheets, ['Photo_File_Index']);
});

test('a failed private thumbnail request does not clear the previous shared report and releases the lock', () => {
  const h = harness(); h.upload('JOB-001', 'before1', h.dataUrl(Buffer.alloc(2 * 1024 * 1024 + 1, 3)));
  h.report.getRange('B4').setValue('Previous job');
  h.context.UrlFetchApp.fetch = () => ({ getResponseCode: () => 403 });
  assert.throws(() => h.context.getJobReportInfo('JOB-001'), /HTTP 403/);
  assert.equal(h.report.getRange('B4').getDisplayValue(), 'Previous job');
  assert.equal(h.isLocked(), false);
});


test('A4 fetches full phone originals over 2 MB without thumbnail conversion', () => {
  const h = harness(), original = Buffer.alloc(2 * 1024 * 1024 + 1, 3);
  h.upload('JOB-001', 'before1', h.dataUrl(original));
  const result = h.context.getPhotoPrintImage('JOB-001', 'before1');
  assert.deepEqual(Buffer.from(result.split(',')[1], 'base64'), original);
  assert.equal(h.requests.length, 0);
});

test('sheet report compacts each side while keeping persisted source slots and URLs unchanged', () => {
  const h = harness();
  h.upload('JOB-001','before2',h.dataUrl([2]));
  h.upload('JOB-001','before4',h.dataUrl([4]));
  h.upload('JOB-001','after3',h.dataUrl([3]));
  const before = JSON.stringify(h.sheets.get('Photo_File_Index').data);
  h.context.getJobReportInfo('JOB-001');
  const images = Object.fromEntries(h.report.images.map(image=>[image.getAnchorCell().getA1Notation(), image.blob.getBytes()[0]]));
  assert.deepEqual(images, {A15:2, A22:4, E15:3});
  assert.equal(JSON.stringify(h.sheets.get('Photo_File_Index').data),before);
  assert.deepEqual([...h.context.getJobProgress('JOB-001').filledTypes],['before2','after3','before4']);
});

test('retrying a persisted upload ID reuses the same original instead of creating duplicate Drive files', () => {
  const h=harness(),data=h.dataUrl([7,8,9]),id='stable-upload-id-00001';
  h.context.uploadImageToSheet('JOB-001','Room','before2',data,'phone.jpg','2026-10-21',undefined,id);
  const firstId=[...h.files.keys()][0];
  h.context.uploadImageToSheet('JOB-001','Room','before2',data,'phone.jpg','2026-10-21',undefined,id);
  assert.equal(h.files.size,1);assert.equal([...h.files.keys()][0],firstId);
  assert.equal([...h.files.values()][0].trashed,false);
  assert.equal(h.context.getJobProgress('JOB-001').filledCount,1);
});
