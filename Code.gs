/**
 * Photo Report – Google Apps Script
 *
 * สคริปต์นี้ควรติดตั้งจากเมนู Extensions > Apps Script ของไฟล์ Google Sheet
 * ที่มีชีทชื่อ Photo_Report
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: '1_V_hfoFb4kiu3YmpDpjQYy9bo5Lcb5hyojyaGC1Jx3s',
  TEMPLATE_SHEET_NAME: 'Photo_Report',
  ASSET_MASTER_SHEET_NAME: 'Asset_Master',
  PHOTO_FILE_INDEX_SHEET_NAME: 'Photo_File_Index',
  PDF_INDEX_SHEET_NAME: 'Photo_PDF_Index',
  PDF_INDEX_HEADERS: Object.freeze([
    'Job No.',
    'ชีตรายงานต้นทาง',
    'URL ชีตรายงาน',
    'วันที่สร้าง PDF ล่าสุด',
    'ชื่อไฟล์ PDF ล่าสุด',
    'URL PDF ล่าสุด',
    'จำนวนรูป',
    'สถานะ'
  ]),
  PHOTO_FILE_INDEX_HEADERS: Object.freeze([
    'วันที่อัปเดต',
    'Job No.',
    'ชีตรายงาน',
    'signage',
    'before1',
    'after1',
    'before2',
    'after2',
    'before3',
    'after3',
    'before4',
    'after4'
  ]),
  PHOTO_FOLDER_ID: '1CU2xREGuoBjzjDVYMfra_KylHGpUd1Re',
  PDF_FOLDER_ID: '1CU2xREGuoBjzjDVYMfra_KylHGpUd1Re',
  TIME_ZONE: 'Asia/Bangkok',
  HEADER_ROW: 4,
  JOB_CELL: 'B4',
  LOCATION_CELL: 'D4',
  DATE_CELL: 'H4',
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  IMAGE_CELL_MAP: Object.freeze({
    signage: 'A7',
    before1: 'A15',
    after1: 'E15',
    before2: 'A22',
    after2: 'E22',
    before3: 'A29',
    after3: 'E29',
    before4: 'A36',
    after4: 'E36'
  }),
  IMAGE_TYPES: Object.freeze([
    'signage',
    'before1',
    'after1',
    'before2',
    'after2',
    'before3',
    'after3',
    'before4',
    'after4'
  ]),
  START_DATE_COLUMN: 23,
  END_DATE_COLUMN: 24,
  ASSET_STATUS_COLUMN: 25,
  REMAINING_COLUMN: 26,
  ALERT_COLUMN: 27,
  OLD_COM_SN_COLUMN: 28,
  OLD_COM_SN_HEADER: 'เลขครุภัณฑ์คอมพิวเตอร์',
  OLD_UPS_SN_COLUMN: 29,
  OLD_UPS_SN_HEADER: 'เลขครุภัณฑ์เครื่องสำรองไฟ',
  PREP_STATUS_COLUMN: 30,
  PREP_STATUS_HEADER: 'สถานะเตรียมเครื่อง',
  IP_COLUMN: 31,
  IP_HEADER: 'เลข IP',
  PROBLEM_COLUMN: 32,
  PROBLEM_HEADER: 'สาเหตุที่ติดปัญหา',
  INSTALL_STATUS_COLUMN: 33,
  INSTALL_STATUS_HEADER: 'สถานะการติดตั้ง',
  INSTALL_REASON_COLUMN: 34,
  INSTALL_REASON_HEADER: 'เหตุผลติดตั้งไม่ได้/ไม่ทัน',
  HUB_SN_COLUMN: 35,
  HUB_SN_HEADER: 'S/N Hub USB',
  OLD_MONITOR_SN_COLUMN: 36,
  OLD_MONITOR_SN_HEADER: 'เลขครุภัณฑ์จอมอนิเตอร์',
  NO_OLD_MACHINE_COLUMN: 37,
  NO_OLD_MACHINE_HEADER: 'ไม่มีเครื่องเดิมให้นำกลับ',
  INSTALL_STATUS_DEFAULT: 'รอดำเนินการ',
  INSTALL_STATUS_OPTIONS: Object.freeze([
    'รอดำเนินการ',
    'ติดตั้งแล้วแต่ไม่เสร็จ',
    'ติดตั้งเสร็จ',
    'ติดตั้งไม่ได้',
    'ติดตั้งไม่ทัน'
  ]),
  PREP_STATUS_DEFAULT: 'ลง Windows',
  PREP_STATUS_NEW_DEFAULT: 'รับเข้าแล้ว',
  PREP_STATUS_OPTIONS: Object.freeze([
    'รับเข้าแล้ว',
    'ลง Windows',
    'ลงโปรแกรม',
    'รอ Activate',
    'พร้อมติดตั้ง',
    'ติดตั้งเสร็จ',
    'ติดปัญหา'
  ])
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ระบบจัดการรูปภาพ')
    .addItem('เปิดหน้าต่างอัปโหลดรูป', 'showSidebar')
    .addItem('อัปเดตประวัติไฟล์รูปจาก Drive', 'backfillPhotoFileIndex')
    .addToUi();
}

/**
 * Entry point สำหรับการ Deploy เป็น Web App
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const page = String(params.page || params.mode || params.view || '').toLowerCase();
  const isPortal = page === 'portal' || page === 'asset' || page === 'manage' || page === 'assetmaster' || page === 'dashboard';
  const isPrintForm = page === 'print-form' || page === 'printform' || page === 'print';
  const fileName = isPrintForm ? 'PrintForm' : (isPortal ? 'Portal' : 'Sidebar');
  const title = isPrintForm ? 'หน้าพิมพ์เอกสาร' : (isPortal ? 'IT Rental Portal' : 'อัปโหลดรูปภาพ Photo Report');

  try {
    if (isPrintForm) {
      const template = HtmlService.createTemplateFromFile(fileName);
      template.jobNo = String(params.job || '').trim();
      template.formType = String(params.formType || 'return').trim().toLowerCase() === 'delivery' ? 'delivery' : 'return';
      return template.evaluate().setTitle(title);
    }
    if (isPortal) {
      const template = HtmlService.createTemplateFromFile(fileName);
      const requestedView = String(params.view || '').trim().toLowerCase();
      template.initialView = ['dashboard', 'work', 'asset', 'documents', 'plan'].indexOf(requestedView) !== -1 ? requestedView : 'dashboard';
      return template.evaluate().setTitle(title);
    }
    return createHtmlOutputFromProjectFile_(fileName, title);
  } catch (error) {
    const message = String(error && error.message ? error.message : error)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return HtmlService.createHtmlOutput(
      '<!doctype html><html lang="th"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Photo Report</title>' +
      '<style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.6;color:#202124}code{background:#f1f3f4;padding:3px 6px;border-radius:4px}.error{color:#b3261e}</style></head>' +
      '<body><h1>เปิดหน้า Photo Report ไม่สำเร็จ</h1><p>กรุณาสร้างไฟล์ HTML ใน Apps Script โดยใช้ชื่อ <code>' + fileName + '</code> (ไม่ต้องพิมพ์ .html) แล้ว Deploy เป็นเวอร์ชันล่าสุด</p><p class="error">รายละเอียด: ' + message + '</p></body></html>'
    ).setTitle('Photo Report - ตรวจสอบการติดตั้ง');
  }
}

function createHtmlOutputFromProjectFile_(fileName, title) {
  try {
    return HtmlService.createHtmlOutputFromFile(fileName)
      .setTitle(title);
  } catch (firstError) {
    return HtmlService.createHtmlOutputFromFile(fileName + '.html')
      .setTitle(title);
  }
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('อัปโหลดรูปภาพ Photo Report')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * ตรวจสอบว่าไฟล์ HTML ที่ doGet ต้องใช้ถูกสร้างไว้ใน Apps Script ครบหรือไม่
 */
function checkWebAppFiles() {
  const result = {};
  ['Sidebar', 'Portal', 'AssetMaster', 'PrintForm'].forEach(function(fileName) {
    try {
      const html = createHtmlOutputFromProjectFile_(fileName, fileName);
      result[fileName] = {
        found: true,
        contentLength: html.getContent().length
      };
    } catch (error) {
      result[fileName] = {
        found: false,
        error: error.message || String(error)
      };
    }
  });
  return result;
}

/**
 * อ่านรายการ Job จาก Asset_Master
 * โครงสร้างเดิมของไฟล์เริ่มข้อมูลที่แถว 4:
 * A = Job No., D:G = อาคาร ชั้น แผนก ห้อง
 */
function getJobData() {
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) return [];

  // หน้าเริ่มต้นใช้เฉพาะข้อมูลสำหรับค้นหาเท่านั้น
  // สถานะรูปจริงจะโหลดเมื่อผู้ใช้เลือก Job ผ่าน getJobProgress()
  const lastRow = sheet.getLastRow();
  if (lastRow < CONFIG.HEADER_ROW) return [];
  const values = sheet.getRange(
    CONFIG.HEADER_ROW,
    1,
    lastRow - CONFIG.HEADER_ROW + 1,
    7
  ).getDisplayValues();
  const jobs = [];

  values.forEach(function(row) {
    const jobText = String(row[0] || '').trim();
    if (!jobText || jobText.indexOf('JOB-') === -1) return;

    const locationParts = [row[3], row[4], row[5], row[6]].filter(function(value) {
      return String(value || '').trim() !== '';
    });
    jobs.push({
      jobNo: jobText,
      location: locationParts.join(' '),
      filledCount: 0,
      requiredCount: CONFIG.IMAGE_TYPES.length,
      complete: false,
      hasReport: false
    });
  });

  return jobs;
}

/**
 * อ่านรายการ Asset_Master สำหรับหน้าจัดการข้อมูล
 * แก้ไขเฉพาะคอลัมน์ A และ D:G เพื่อคงข้อมูลคอลัมน์อื่นไว้
 */
function getAssetMasterRows() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต ' + CONFIG.ASSET_MASTER_SHEET_NAME);

  const lastRow = Math.max(sheet.getLastRow(), CONFIG.HEADER_ROW - 1);
  if (lastRow < CONFIG.HEADER_ROW) return [];

  const values = sheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - CONFIG.HEADER_ROW + 1, 7).getDisplayValues();
  return values.map(function(row, index) {
    return {
      rowNumber: CONFIG.HEADER_ROW + index,
      jobNo: row[0] || '',
      building: row[3] || '',
      floor: row[4] || '',
      department: row[5] || '',
      room: row[6] || ''
    };
  }).filter(function(item) {
    return item.jobNo || item.building || item.floor || item.department || item.room;
  });
}

/**
 * เพิ่มหรือแก้ไขข้อมูล Asset_Master จากหน้ามือถือ
 */
function saveAssetMasterRow(rowNumber, asset) {
  asset = asset || {};
  const jobNo = String(asset.jobNo || '').trim();
  if (!jobNo) throw new Error('กรุณากรอกเลข Job');
  if (jobNo.indexOf('JOB-') !== 0) throw new Error('เลข Job ต้องขึ้นต้นด้วย JOB-');

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต ' + CONFIG.ASSET_MASTER_SHEET_NAME);

  let targetRow = Number(rowNumber);
  if (!targetRow || targetRow < CONFIG.HEADER_ROW) {
    targetRow = Math.max(sheet.getLastRow() + 1, CONFIG.HEADER_ROW);
  }

  const duplicate = getAssetMasterRows().some(function(item) {
    return item.rowNumber !== targetRow && item.jobNo.toLowerCase() === jobNo.toLowerCase();
  });
  if (duplicate) throw new Error('มีเลข Job นี้อยู่แล้ว: ' + jobNo);

  sheet.getRange(targetRow, 1).setValue(jobNo);
  sheet.getRange(targetRow, 4, 1, 4).setValues([[
    asset.building || '',
    asset.floor || '',
    asset.department || '',
    asset.room || ''
  ]]);
  SpreadsheetApp.flush();

  return {
    message: (rowNumber ? 'แก้ไขข้อมูล ' : 'เพิ่มข้อมูล ') + jobNo + ' เรียบร้อยแล้ว',
    rowNumber: targetRow,
    jobNo: jobNo
  };
}

/**
 * คืนสถานะงานของ Job ที่เลือก เพื่อให้หลายคนช่วยเติมรูปได้
 */
function getJobProgress(jobNo) {
  if (!jobNo) throw new Error('ไม่พบเลข Job');

  const sheetName = buildJobSheetName_(jobNo);
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  const indexRecord = getPhotoFileIndexRecord_(jobNo);
  const asset = getAssetMasterJobInfo_(jobNo);
  const sheetFilledTypes = sheet ? getFilledImageTypes_(sheet) : [];
  const indexedTypes = CONFIG.IMAGE_TYPES.filter(function(imageType) { return !!indexRecord.urls[imageType]; });
  const filledTypes = CONFIG.IMAGE_TYPES.filter(function(imageType) {
    return sheetFilledTypes.indexOf(imageType) !== -1 || indexedTypes.indexOf(imageType) !== -1;
  });
  const missingTypes = CONFIG.IMAGE_TYPES.filter(function(imageType) {
    return filledTypes.indexOf(imageType) === -1;
  });

  return {
    exists: !!sheet,
    sheetName: sheetName,
    jobNo: String(jobNo),
    location: sheet ? sheet.getRange(CONFIG.LOCATION_CELL).getDisplayValue() : asset.location,
    date: sheet ? sheet.getRange(CONFIG.DATE_CELL).getDisplayValue() : indexRecord.updatedAt,
    filledTypes: filledTypes,
    previewUrls: getPhotoPreviewUrls_(jobNo, filledTypes),
    missingTypes: missingTypes,
    filledCount: filledTypes.length,
    requiredCount: CONFIG.IMAGE_TYPES.length,
    complete: missingTypes.length === 0
  };
}

/**
 * คืน URL thumbnail ของรูปไฟล์ล่าสุดของแต่ละช่องจากโฟลเดอร์รูป
 * ใช้ชื่อไฟล์รูปแบบ JOB_imageType_timestamp_originalName
 */
function getPhotoFileIndexRecord_(jobNo) {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.PHOTO_FILE_INDEX_SHEET_NAME);
  const result = { updatedAt: '', urls: {} };
  if (!sheet || sheet.getLastRow() < 2) return result;
  const values = sheet.getDataRange().getDisplayValues();
  const target = String(jobNo || '').trim().toLowerCase();
  for (let i = values.length - 1; i >= 1; i -= 1) {
    if (String(values[i][1] || '').trim().toLowerCase() !== target) continue;
    result.updatedAt = values[i][0] || '';
    CONFIG.IMAGE_TYPES.forEach(function(imageType, index) {
      result.urls[imageType] = values[i][3 + index] || '';
    });
    return result;
  }
  return result;
}

function getAssetMasterJobInfo_(jobNo) {
  const target = String(jobNo || '').trim().toLowerCase();
  const row = getAssetMasterRows().find(function(item) { return String(item.jobNo || '').trim().toLowerCase() === target; });
  if (!row) return { location: '' };
  return { location: [row.building, row.floor, row.department, row.room].filter(function(value) { return String(value || '').trim(); }).join(' ') };
}

function getPhotoPreviewUrls_(jobNo, activeTypes) {
  const safeJobNo = String(jobNo || '').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  const previewUrls = {};
  if (!safeJobNo) return previewUrls;
  const activeTypeSet = {};
  (activeTypes || CONFIG.IMAGE_TYPES).forEach(function(imageType) { activeTypeSet[imageType] = true; });

  const folder = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID);
  const files = folder.searchFiles("trashed = false and title contains '" + safeJobNo + "_'");
  const latestByType = {};
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    CONFIG.IMAGE_TYPES.forEach(function(imageType) {
      if (!activeTypeSet[imageType]) return;
      const prefix = safeJobNo + '_' + imageType + '_';
      if (name.indexOf(prefix) === 0) {
        const created = file.getDateCreated().getTime();
        if (!latestByType[imageType] || created > latestByType[imageType].created) {
          latestByType[imageType] = { id: file.getId(), created: created };
        }
      }
    });
  }

  Object.keys(latestByType).forEach(function(imageType) {
    // ขอภาพ 2400px สำหรับพรีวิวงานพิมพ์โดยไม่เปลี่ยนขั้นตอนอัปโหลดที่ใช้งานอยู่
    previewUrls[imageType] = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(latestByType[imageType].id) + '&sz=w2400';
  });
  return previewUrls;
}

/**
 * สร้าง/บันทึกชีทรายงานแยกตาม Job โดยไม่ทับรูปที่คนอื่นอัปโหลดไว้
 */
function saveJobProgress(jobNo, location, installDate) {
  if (!jobNo) throw new Error('กรุณาเลือก Job ก่อนบันทึก');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ensureJobSheet_(jobNo);
    sheet.getRange(CONFIG.JOB_CELL).setValue(jobNo);
    sheet.getRange(CONFIG.LOCATION_CELL).setValue(location || '');
    sheet.getRange(CONFIG.DATE_CELL).setValue(parsePortalDate_(installDate) || new Date());
    SpreadsheetApp.flush();

    const filledTypes = getFilledImageTypes_(sheet);
    return {
      message: 'บันทึกงาน ' + jobNo + ' แล้ว สามารถกลับมาทำต่อภายหลังได้',
      sheetName: sheet.getName(),
      filledTypes: filledTypes,
      missingTypes: CONFIG.IMAGE_TYPES.filter(function(imageType) { return filledTypes.indexOf(imageType) === -1; }),
      complete: filledTypes.length === CONFIG.IMAGE_TYPES.length
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * คืน URL ของชีทรายงานแยกตาม Job เพื่อเปิดดูหรือสั่งพิมพ์จาก Google Sheets
 */
function getJobReportInfo(jobNo) {
  if (!jobNo) throw new Error('กรุณาระบุ Job');
  const sheet = ensureJobSheet_(jobNo);
  SpreadsheetApp.flush();
  return {
    sheetName: sheet.getName(),
    sheetUrl: buildSheetEditUrl_(sheet)
  };
}

function prepareJobForm(jobNo, formType) {
  const requestedJob = String(jobNo || '').trim();
  const type = String(formType || '').trim().toLowerCase();
  if (!requestedJob) throw new Error('กรุณาเลือก Job ก่อนเปิดเอกสาร');
  if (['delivery', 'return'].indexOf(type) === -1) throw new Error('ไม่รู้จักประเภทเอกสาร');

  const spreadsheet = getSpreadsheet_();
  const assetSheet = spreadsheet.getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  const deliverySheet = spreadsheet.getSheetByName('Delivery_Form');
  const returnSheet = spreadsheet.getSheetByName('Return_Form');
  if (!assetSheet || !deliverySheet || !returnSheet) throw new Error('ไม่พบชีต Asset_Master, Delivery_Form หรือ Return_Form');

  const rows = getAssetPortalRows_(assetSheet);
  const asset = rows.find(function(row) { return String(row.jobNo).toLowerCase() === requestedJob.toLowerCase(); });
  if (!asset) throw new Error('ไม่พบ Job นี้ใน Asset_Master: ' + requestedJob);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    deliverySheet.getRange('B4').setValue(asset.jobNo);
    if (!returnSheet.getRange('B4').getFormula()) returnSheet.getRange('B4').setValue(asset.jobNo);
    SpreadsheetApp.flush();
    const sheet = type === 'delivery' ? deliverySheet : returnSheet;
    const webAppUrl = ScriptApp.getService().getUrl() || '';
    const printUrl = webAppUrl
      ? webAppUrl + '?page=print-form&job=' + encodeURIComponent(asset.jobNo) + '&formType=' + encodeURIComponent(type)
      : '';
    return {
      jobNo: asset.jobNo,
      formType: type,
      formName: type === 'delivery' ? 'ใบส่ง' : 'ใบรับ',
      sheetUrl: buildSheetEditUrl_(sheet),
      printUrl: printUrl,
      message: 'เตรียม ' + (type === 'delivery' ? 'ใบส่ง' : 'ใบรับ') + ' สำหรับ ' + asset.jobNo + ' แล้ว'
    };
  } finally {
    lock.releaseLock();
  }
}

function getPrintFormData(jobNo, formType) {
  const prepared = prepareJobForm(jobNo, formType);
  const spreadsheet = getSpreadsheet_();
  const type = prepared.formType;
  const sheet = spreadsheet.getSheetByName(type === 'delivery' ? 'Delivery_Form' : 'Return_Form');
  if (!sheet) throw new Error('ไม่พบชีตสำหรับเอกสาร ' + type);
  const columnCount = type === 'delivery' ? 8 : 7;
  const values = sheet.getRange(1, 1, 28, columnCount).getDisplayValues();
  return {
    jobNo: prepared.jobNo,
    formType: type,
    formName: prepared.formName,
    sheetUrl: prepared.sheetUrl,
    values: values
  };
}

function getSheetEditLinks() {
  const spreadsheet = getSpreadsheet_();
  const template = spreadsheet.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
  const assetMaster = spreadsheet.getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!template || !assetMaster) {
    throw new Error('ไม่พบชีต Photo_Report หรือ Asset_Master');
  }

  const photoFileIndex = ensurePhotoFileIndexSheet_();
  if (photoFileIndex.getLastRow() === 1) backfillPhotoFileIndex_();
  const webAppUrl = ScriptApp.getService().getUrl() || '';
  return {
    spreadsheetUrl: buildSpreadsheetEditUrl_(),
    templateUrl: buildSheetEditUrl_(template),
    assetMasterUrl: buildSheetEditUrl_(assetMaster),
    photoFileIndexUrl: buildSheetEditUrl_(photoFileIndex),
    reportWebUrl: webAppUrl || '?page=report',
    portalWebUrl: webAppUrl ? webAppUrl + '?page=portal' : '?page=portal',
    assetWebUrl: webAppUrl ? webAppUrl + '?page=asset' : '?page=asset'
  };
}

/**
 * อ่านข้อมูลรวมสำหรับหน้า IT Rental Portal
 */
function getPlanOverviewData_(spreadsheet, assetRows) {
  const definitions = [
    { sheetName: 'B69', label: 'ตึก 69 ปี', aliases: ['69'], hasExtra: false },
    { sheetName: 'BMT', label: 'ตึกเมตตาธรรม', aliases: ['เมตตาธรรม', 'BMT'], hasExtra: true }
  ];
  const locations = {};
  definitions.forEach(function(definition) {
    const sheet = spreadsheet.getSheetByName(definition.sheetName);
    const planRows = [];
    if (sheet && sheet.getLastRow() > 0) {
      const values = sheet.getDataRange().getDisplayValues();
      values.forEach(function(row, index) {
        const offset = definition.hasExtra ? 1 : 0;
        const building = String(row[0] || '').trim();
        const department = String(row[1] || '').trim();
        const quantityText = String(row[2] || '').replace(/,/g, '').trim();
        const quantity = Number(quantityText) || 0;
        const start = String(row[3 + offset] || '').trim();
        const days = String(row[4 + offset] || '').trim();
        const finish = String(row[5 + offset] || '').trim();
        if (index < 4 || (!department && !quantity && !building) || /หน่วยงาน|จำนวนเครื่อง|แผนการดำเนินการ/.test(department + building)) return;
        planRows.push({ rowNumber: index + 1, building, department, quantity, start, days, finish });
      });
    }
    const actualRows = assetRows.filter(function(row) {
      const text = [row.building, row.department, row.room].join(' ').toLowerCase();
      return definition.aliases.some(function(alias) { return text.indexOf(String(alias).toLowerCase()) !== -1; });
    });
    const installed = actualRows.filter(function(row) { return row.installStatus === 'ติดตั้งเสร็จ'; }).length;
    const delivered = actualRows.filter(function(row) { return row.status !== 'รับคืนแล้ว' && row.status !== 'ส่งซ่อม' && row.status !== 'ตัดจำหน่าย'; }).length;
    locations[definition.sheetName] = {
      key: definition.sheetName,
      label: definition.label,
      planCount: planRows.reduce(function(total, row) { return total + row.quantity; }, 0),
      planRows: planRows,
      actualCount: actualRows.length,
      deliveredCount: delivered,
      installedCount: installed
    };
  });
  return { locations: locations };
}

function getWorkbookPortalData() {
  const spreadsheet = getSpreadsheet_();
  const assetSheet = spreadsheet.getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!assetSheet) throw new Error('ไม่พบชีต Asset_Master');
  ensurePreparationStatusColumn_(assetSheet);

  const rows = getAssetPortalRows_(assetSheet);
  const jobWorkRows = buildJobWorkRows_(rows, spreadsheet);
  const sheetNames = ['Dashboard', 'Asset_Master', 'Delivery_Form', 'Return_Form', 'Movement_Log', 'Photo_Report'];
  const sheetLinks = {};
  sheetNames.forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet) sheetLinks[name] = buildSheetEditUrl_(sheet);
  });

  return {
    dashboard: buildPortalDashboard_(rows, jobWorkRows),
    planOverview: getPlanOverviewData_(spreadsheet, rows),
    assetRows: rows,
    jobWorkRows: jobWorkRows,
    sheetLinks: sheetLinks,
    spreadsheetUrl: buildSpreadsheetEditUrl_(),
    photoReportUrl: ScriptApp.getService().getUrl() || ''
  };
}

/**
 * บันทึกข้อมูล Asset_Master จากหน้า Portal โดยไม่เขียนทับสูตร AA และ AB
 */
function saveAssetMasterPortalRow(rowNumber, data) {
  data = data || {};
  const jobNo = String(data.jobNo || '').trim().toUpperCase();
  if (!jobNo) throw new Error('กรุณากรอกเลข Job');
  if (jobNo.indexOf('JOB-') !== 0) throw new Error('เลข Job ต้องขึ้นต้นด้วย JOB-');

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต Asset_Master');
  ensurePreparationStatusColumn_(sheet);

  let targetRow = Number(rowNumber);
  if (!targetRow || targetRow < CONFIG.HEADER_ROW) {
    targetRow = Math.max(sheet.getLastRow() + 1, CONFIG.HEADER_ROW);
  }

  const existing = getAssetPortalRows_(sheet);
  if (existing.some(function(item) {
    return item.rowNumber !== targetRow && String(item.jobNo).toLowerCase() === jobNo.toLowerCase();
  })) {
    throw new Error('มีเลข Job นี้อยู่แล้ว: ' + jobNo);
  }
  const existingRow = existing.find(function(item) { return item.rowNumber === targetRow; });
  const assetType = String((data.assetType !== undefined && String(data.assetType).trim()) ? data.assetType : ((data.type !== undefined && String(data.type).trim()) ? data.type : ((existingRow && existingRow.type) || ''))).trim();
  const prepStatus = normalizePreparationStatus_(data.prepStatus || (existingRow && existingRow.prepStatus) || CONFIG.PREP_STATUS_NEW_DEFAULT);
  const ipAddress = data.ipAddress !== undefined ? String(data.ipAddress || '').trim() : ((existingRow && existingRow.ipAddress) || '');
  const problemDetail = String(data.problemDetail || '').trim();
  const installStatus = normalizeInstallationStatus_(data.installStatus || (existingRow && existingRow.installStatus) || '');
  const installReason = String(data.installReason !== undefined ? data.installReason : ((existingRow && existingRow.installReason) || '')).trim();
  if (prepStatus === 'ติดปัญหา' && !problemDetail) throw new Error('กรุณาเลือกว่าติดปัญหาเรื่องอะไร');
  if (installationNeedsReason_(installStatus) && !installReason) throw new Error('กรุณาระบุปัญหาของงานติดตั้งที่ยังไม่เสร็จ');

  const mainValues = [[
    jobNo,
    data.setCode || '',
    assetType,
    data.building || '',
    data.floor || '',
    data.department || '',
    data.room || '',
    data.contact || '',
    data.contractNo || '',
    data.brand || '',
    data.specs || '',
    data.aioSn || '',
    data.mac || '',
    data.windowsKey || '',
    data.upsModel || '',
    data.upsSn || '',
    toBoolean_(data.deliverAio),
    toBoolean_(data.deliverUps),
    data.hubModel || '',
    toBoolean_(data.deliverHub),
    toBoolean_(data.deliverKbMouse),
    toBoolean_(data.deliverAdapter)
  ]];

  // Asset_Master ปัจจุบันไม่มีคอลัมน์สายไฟ UPS แยกแล้ว จึงเขียนข้อมูลหลักเพียง A:V
  sheet.getRange(targetRow, 1, 1, 22).setValues(mainValues);
  sheet.getRange(targetRow, CONFIG.START_DATE_COLUMN, 1, 2).setValues([[
    parsePortalDate_(data.startDate),
    parsePortalDate_(data.endDate)
  ]]);
  ensurePreparationStatusColumn_(sheet);
  sheet.getRange(targetRow, CONFIG.PREP_STATUS_COLUMN).setValue(prepStatus);
  sheet.getRange(targetRow, CONFIG.IP_COLUMN).setValue(ipAddress);
  sheet.getRange(targetRow, CONFIG.PROBLEM_COLUMN).setValue(prepStatus === 'ติดปัญหา' ? problemDetail : '');
  sheet.getRange(targetRow, CONFIG.INSTALL_STATUS_COLUMN).setValue(installStatus);
  sheet.getRange(targetRow, CONFIG.INSTALL_REASON_COLUMN).setValue(installationNeedsReason_(installStatus) ? installReason : '');
  const noOldMachine = toBoolean_(data.noOldMachine);
  sheet.getRange(targetRow, CONFIG.HUB_SN_COLUMN).setValue(data.hubSn || '');
  sheet.getRange(targetRow, CONFIG.OLD_MONITOR_SN_COLUMN).setValue(noOldMachine ? '' : (data.oldMonitorSn || ''));
  sheet.getRange(targetRow, CONFIG.NO_OLD_MACHINE_COLUMN).setValue(noOldMachine);
  sheet.getRange(targetRow, CONFIG.OLD_COM_SN_COLUMN, 1, 2).setValues([[
    noOldMachine ? '' : (data.oldComSn || ''),
    noOldMachine ? '' : (data.oldUpsSn || '')
  ]]);

  // ถ้าเป็นแถวใหม่ ให้คัดลอกสูตรวันคงเหลือและการแจ้งเตือนจากแถวก่อนหน้า
  if (!sheet.getRange(targetRow, CONFIG.REMAINING_COLUMN).getFormula()) {
    if (targetRow > CONFIG.HEADER_ROW) {
      const previous = sheet.getRange(targetRow - 1, CONFIG.REMAINING_COLUMN, 1, 2);
      previous.copyTo(sheet.getRange(targetRow, CONFIG.REMAINING_COLUMN, 1, 2), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    }
    if (!sheet.getRange(targetRow, CONFIG.REMAINING_COLUMN).getFormula()) {
      sheet.getRange(targetRow, CONFIG.REMAINING_COLUMN).setFormula('=IF(X' + targetRow + '="","-",X' + targetRow + '-TODAY())');
      sheet.getRange(targetRow, CONFIG.ALERT_COLUMN).setFormula('=IF(Y' + targetRow + '="ส่งมอบแล้ว","ส่งมอบแล้ว",IF(Y' + targetRow + '="รอส่งมอบ","รอส่งมอบ",IF(X' + targetRow + '="","-",IF(Z' + targetRow + '<0,"หมดสัญญาแล้ว",IF(Z' + targetRow + '<=30,"เตือน: ใกล้หมดสัญญา","ปกติ")))))');
    }
  }
  SpreadsheetApp.flush();

  return {
    message: (rowNumber ? 'แก้ไขข้อมูล ' : 'เพิ่มข้อมูล ') + jobNo + ' เรียบร้อยแล้ว',
    rowNumber: targetRow,
    jobNo: jobNo
  };
}

function getAssetPortalRows_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), CONFIG.HEADER_ROW - 1);
  if (lastRow < CONFIG.HEADER_ROW) return [];
  const raw = sheet.getRange(CONFIG.HEADER_ROW, 1, lastRow - CONFIG.HEADER_ROW + 1, CONFIG.NO_OLD_MACHINE_COLUMN).getValues();
  return raw.map(function(row, index) {
    return {
      rowNumber: CONFIG.HEADER_ROW + index,
      jobNo: toPortalValue_(row[0]),
      setCode: toPortalValue_(row[1]),
      type: toPortalValue_(row[2]),
      building: toPortalValue_(row[3]),
      floor: toPortalValue_(row[4]),
      department: toPortalValue_(row[5]),
      room: toPortalValue_(row[6]),
      contact: toPortalValue_(row[7]),
      contractNo: toPortalValue_(row[8]),
      brand: toPortalValue_(row[9]),
      specs: toPortalValue_(row[10]),
      aioSn: toPortalValue_(row[11]),
      mac: toPortalValue_(row[12]),
      windowsKey: toPortalValue_(row[13]),
      upsModel: toPortalValue_(row[14]),
      upsSn: toPortalValue_(row[15]),
      deliverAio: toBoolean_(row[16]),
      deliverUps: toBoolean_(row[17]),
      hubModel: toPortalValue_(row[18]),
      deliverHub: toBoolean_(row[19]),
      deliverKbMouse: toBoolean_(row[20]),
      deliverAdapter: toBoolean_(row[21]),
      // compatibility field for the existing client; UPS + สายไฟ is stored only in R now
      deliverUpsCord: toBoolean_(row[17]),
      startDate: toPortalDate_(row[CONFIG.START_DATE_COLUMN - 1]),
      endDate: toPortalDate_(row[CONFIG.END_DATE_COLUMN - 1]),
      status: toPortalValue_(row[CONFIG.ASSET_STATUS_COLUMN - 1]),
      remaining: toPortalValue_(row[CONFIG.REMAINING_COLUMN - 1]),
      alert: toPortalValue_(row[CONFIG.ALERT_COLUMN - 1]),
      oldComSn: toPortalValue_(row[CONFIG.OLD_COM_SN_COLUMN - 1]),
      oldUpsSn: toPortalValue_(row[CONFIG.OLD_UPS_SN_COLUMN - 1]),
      prepStatus: toPortalValue_(row[CONFIG.PREP_STATUS_COLUMN - 1]) || CONFIG.PREP_STATUS_DEFAULT,
      ipAddress: toPortalValue_(row[CONFIG.IP_COLUMN - 1]),
      problemDetail: toPortalValue_(row[CONFIG.PROBLEM_COLUMN - 1]),
      installStatus: normalizeInstallationStatus_(toPortalValue_(row[CONFIG.INSTALL_STATUS_COLUMN - 1]) || (toPortalValue_(row[CONFIG.PREP_STATUS_COLUMN - 1]) === 'ติดตั้งเสร็จ' ? 'ติดตั้งเสร็จ' : CONFIG.INSTALL_STATUS_DEFAULT)),
      installReason: toPortalValue_(row[CONFIG.INSTALL_REASON_COLUMN - 1]),
      hubSn: toPortalValue_(row[CONFIG.HUB_SN_COLUMN - 1]),
      oldMonitorSn: toPortalValue_(row[CONFIG.OLD_MONITOR_SN_COLUMN - 1]),
      noOldMachine: toBoolean_(row[CONFIG.NO_OLD_MACHINE_COLUMN - 1]),
    };
  }).filter(function(row) {
    return row.jobNo || row.setCode || row.building || row.department;
  });
}

function ensurePreparationStatusColumn_(sheet) {
  const requiredColumns = Math.max(CONFIG.PREP_STATUS_COLUMN, CONFIG.IP_COLUMN, CONFIG.PROBLEM_COLUMN, CONFIG.INSTALL_STATUS_COLUMN, CONFIG.INSTALL_REASON_COLUMN, CONFIG.HUB_SN_COLUMN, CONFIG.OLD_MONITOR_SN_COLUMN, CONFIG.NO_OLD_MACHINE_COLUMN);
  const currentColumns = sheet.getMaxColumns();
  if (currentColumns < requiredColumns) sheet.insertColumnsAfter(currentColumns, requiredColumns - currentColumns);
  const extraHeaders = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.HUB_SN_COLUMN, 1, 3).getDisplayValues()[0];
  const expectedExtraHeaders = [CONFIG.HUB_SN_HEADER, CONFIG.OLD_MONITOR_SN_HEADER, CONFIG.NO_OLD_MACHINE_HEADER];
  const legacyExtraHeaders = [CONFIG.HUB_SN_HEADER, 'S/N จอเดิม', CONFIG.NO_OLD_MACHINE_HEADER];
  const hasConflictingExtraColumns = extraHeaders.some(function(header, index) {
    return header && header !== expectedExtraHeaders[index] && header !== legacyExtraHeaders[index];
  });
  // Do not overwrite future/custom columns that may already follow the old schema.
  // Reserve three extension columns immediately after the current managed data.
  if (hasConflictingExtraColumns) sheet.insertColumnsAfter(CONFIG.INSTALL_REASON_COLUMN, 3);
  const prepHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.PREP_STATUS_COLUMN);
  if (!prepHeaderCell.getDisplayValue()) prepHeaderCell.setValue(CONFIG.PREP_STATUS_HEADER);
  const ipHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.IP_COLUMN);
  if (!ipHeaderCell.getDisplayValue()) ipHeaderCell.setValue(CONFIG.IP_HEADER);
  const problemHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.PROBLEM_COLUMN);
  if (!problemHeaderCell.getDisplayValue()) problemHeaderCell.setValue(CONFIG.PROBLEM_HEADER);
  const installStatusHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.INSTALL_STATUS_COLUMN);
  if (!installStatusHeaderCell.getDisplayValue()) installStatusHeaderCell.setValue(CONFIG.INSTALL_STATUS_HEADER);
  const installReasonHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.INSTALL_REASON_COLUMN);
  if (!installReasonHeaderCell.getDisplayValue()) installReasonHeaderCell.setValue(CONFIG.INSTALL_REASON_HEADER);
  const oldComHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.OLD_COM_SN_COLUMN);
  if (!oldComHeaderCell.getDisplayValue() || oldComHeaderCell.getDisplayValue() === 'COM S/N เดิม') oldComHeaderCell.setValue(CONFIG.OLD_COM_SN_HEADER);
  const oldUpsHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.OLD_UPS_SN_COLUMN);
  if (!oldUpsHeaderCell.getDisplayValue() || oldUpsHeaderCell.getDisplayValue() === 'UPS S/N เดิม') oldUpsHeaderCell.setValue(CONFIG.OLD_UPS_SN_HEADER);
  const hubSnHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.HUB_SN_COLUMN);
  if (!hubSnHeaderCell.getDisplayValue()) hubSnHeaderCell.setValue(CONFIG.HUB_SN_HEADER);
  const oldMonitorSnHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.OLD_MONITOR_SN_COLUMN);
  if (!oldMonitorSnHeaderCell.getDisplayValue() || oldMonitorSnHeaderCell.getDisplayValue() === 'S/N จอเดิม') oldMonitorSnHeaderCell.setValue(CONFIG.OLD_MONITOR_SN_HEADER);
  const noOldMachineHeaderCell = sheet.getRange(CONFIG.HEADER_ROW - 1, CONFIG.NO_OLD_MACHINE_COLUMN);
  if (!noOldMachineHeaderCell.getDisplayValue()) noOldMachineHeaderCell.setValue(CONFIG.NO_OLD_MACHINE_HEADER);
}

function normalizePreparationStatus_(value) {
  const text = String(value || '').trim();
  return CONFIG.PREP_STATUS_OPTIONS.indexOf(text) !== -1 ? text : CONFIG.PREP_STATUS_NEW_DEFAULT;
}

function normalizeInstallationStatus_(value) {
  const text = String(value || '').trim();
  return CONFIG.INSTALL_STATUS_OPTIONS.indexOf(text) !== -1 ? text : CONFIG.INSTALL_STATUS_DEFAULT;
}

function installationNeedsReason_(status) {
  return status === 'ติดตั้งแล้วแต่ไม่เสร็จ' || status === 'ติดตั้งไม่ได้' || status === 'ติดตั้งไม่ทัน';
}

function updateAssetInstallationStatus(rowNumber, installStatus, installReason) {
  const targetRow = Number(rowNumber);
  const status = normalizeInstallationStatus_(installStatus);
  const reason = String(installReason || '').trim();
  if (!targetRow || targetRow < CONFIG.HEADER_ROW) throw new Error('ไม่พบแถว Asset_Master ที่ต้องการแก้ไข');
  if (installationNeedsReason_(status) && !reason) throw new Error('กรุณาระบุปัญหาของงานติดตั้งที่ยังไม่เสร็จ');

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต Asset_Master');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensurePreparationStatusColumn_(sheet);
    sheet.getRange(targetRow, CONFIG.INSTALL_STATUS_COLUMN).setValue(status);
    sheet.getRange(targetRow, CONFIG.INSTALL_REASON_COLUMN).setValue(installationNeedsReason_(status) ? reason : '');
    SpreadsheetApp.flush();
    return { message: 'อัปเดตผลการติดตั้งแล้ว', rowNumber: targetRow, installStatus: status, installReason: reason };
  } finally {
    lock.releaseLock();
  }
}

function updateAssetPreparationStatus(rowNumber, prepStatus, problemDetail) {
  const targetRow = Number(rowNumber);
  const status = String(prepStatus || '').trim();
  const reason = String(problemDetail || '').trim();
  if (!targetRow || targetRow < CONFIG.HEADER_ROW) throw new Error('ไม่พบแถว Asset_Master ที่ต้องการแก้ไข');
  if (CONFIG.PREP_STATUS_OPTIONS.indexOf(status) === -1) throw new Error('สถานะเตรียมเครื่องไม่ถูกต้อง');
  if (status === 'ติดปัญหา' && !reason) throw new Error('กรุณาเลือกว่าติดปัญหาเรื่องอะไร');

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต Asset_Master');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensurePreparationStatusColumn_(sheet);
    sheet.getRange(targetRow, CONFIG.PREP_STATUS_COLUMN).setValue(status);
    sheet.getRange(targetRow, CONFIG.PROBLEM_COLUMN).setValue(status === 'ติดปัญหา' ? reason : '');
    SpreadsheetApp.flush();
    return { message: 'อัปเดตสถานะเตรียมเครื่องแล้ว', rowNumber: targetRow, prepStatus: status, problemDetail: status === 'ติดปัญหา' ? reason : '' };
  } finally {
    lock.releaseLock();
  }
}

function updateAssetStatus(rowNumber, assetStatus) {
  const targetRow = Number(rowNumber);
  const status = String(assetStatus || '').trim();
  const allowed = ['รอส่งมอบ', 'ส่งมอบแล้ว'];
  if (!targetRow || targetRow < CONFIG.HEADER_ROW) throw new Error('ไม่พบแถว Asset_Master ที่ต้องการแก้ไข');
  if (allowed.indexOf(status) === -1) throw new Error('สถานะชุดไม่ถูกต้อง');

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต Asset_Master');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet.getRange(targetRow, CONFIG.ASSET_STATUS_COLUMN).setValue(status);
    SpreadsheetApp.flush();
    return { message: 'อัปเดตสถานะชุดใน Asset_Master แล้ว', rowNumber: targetRow, status: status };
  } finally {
    lock.releaseLock();
  }
}

function updateAssetAccessoryBundleStatus(rowNumber, value) {
  const targetRow = Number(rowNumber);
  if (!targetRow || targetRow < CONFIG.HEADER_ROW) throw new Error('ไม่พบแถว Asset_Master ที่ต้องการแก้ไข');

  const checked = toBoolean_(value);
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต Asset_Master');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // UPS + สายไฟเป็นสถานะรวม เก็บในคอลัมน์ R เท่านั้น
    sheet.getRange(targetRow, 18).setValue(checked);
    SpreadsheetApp.flush();
    return { message: (checked ? 'ติ๊กส่ง UPS + สายไฟ ใน Asset_Master แล้ว' : 'ยกเลิกสถานะส่ง UPS + สายไฟ ใน Asset_Master แล้ว'), rowNumber: targetRow, value: checked };
  } finally {
    lock.releaseLock();
  }
}

function updateAssetAccessoryStatus(rowNumber, fieldName, value) {
  const targetRow = Number(rowNumber);
  const columns = {
    deliverAio: 17,
    deliverUps: 18,
    deliverHub: 20,
    deliverKbMouse: 21,
    deliverAdapter: 22
  };
  const labels = {
    deliverAio: 'AIO',
    deliverUps: 'UPS + สายไฟ',
    deliverHub: 'USB HUB',
    deliverKbMouse: 'KB + Mouse',
    deliverAdapter: 'Adapter AIO'
  };
  const field = String(fieldName || '').trim();
  const column = columns[field];
  if (!targetRow || targetRow < CONFIG.HEADER_ROW) throw new Error('ไม่พบแถว Asset_Master ที่ต้องการแก้ไข');
  if (!column) throw new Error('ไม่พบช่องสถานะอุปกรณ์ที่อนุญาตให้แก้ไข');

  const checked = toBoolean_(value);
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบชีต Asset_Master');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    sheet.getRange(targetRow, column).setValue(checked);
    SpreadsheetApp.flush();
    return { message: (checked ? 'ติ๊กส่ง ' : 'ยกเลิกสถานะส่ง ') + labels[field] + ' ใน Asset_Master แล้ว', rowNumber: targetRow, fieldName: field, value: checked };
  } finally {
    lock.releaseLock();
  }
}

function buildJobWorkRows_(assetRows, spreadsheet) {
  const photoByJob = getPhotoIndexByJob_(spreadsheet);
  const primaryTypes = ['signage', 'before1', 'after1'];
  const primaryLabels = { signage: 'ชื่อหน่วยงาน', before1: 'ก่อนติดตั้ง', after1: 'หลังติดตั้ง' };
  const rows = (assetRows || []).map(function(row) {
    const key = String(row.jobNo || '').trim().toLowerCase();
    const photo = photoByJob[key] || {};
    const filledTypes = CONFIG.IMAGE_TYPES.filter(function(type) { return !!photo[type]; });
    const missingPrimary = primaryTypes.filter(function(type) { return !photo[type]; });
    const accessoryMissing = [];
    if (row.status !== 'ส่งมอบแล้ว') accessoryMissing.push('รอส่งมอบ');
    const upsBundleComplete = !!row.deliverUps;
    if (!upsBundleComplete) accessoryMissing.push('UPS + สายไฟ');
    if (!row.deliverHub) accessoryMissing.push('USB HUB');

    const installBlocked = installationNeedsReason_(row.installStatus);
    const blockers = [];
    if (installBlocked) blockers.push(row.installStatus + (row.installReason ? ': ' + row.installReason : ''));
    else if (row.installStatus !== 'ติดตั้งเสร็จ') blockers.push('รอผลการติดตั้ง');
    if (row.status !== 'ส่งมอบแล้ว') blockers.push('อุปกรณ์ยังไม่ส่งมอบ');
    if (!upsBundleComplete) blockers.push('ขาด UPS + สายไฟ');
    if (!row.deliverHub) blockers.push('ขาด USB HUB');
    if (missingPrimary.length) blockers.push('ขาดรูป ' + missingPrimary.map(function(type) { return primaryLabels[type]; }).join(', '));

    return {
      rowNumber: row.rowNumber,
      jobNo: row.jobNo,
      building: row.building,
      floor: row.floor,
      department: row.department,
      room: row.room,
      location: [row.building, row.floor, row.department, row.room].filter(Boolean).join(' | '),
      prepStatus: row.prepStatus,
      installStatus: row.installStatus,
      installReason: row.installReason,
      accessoryStatus: accessoryMissing.length ? accessoryMissing.join(', ') : 'อุปกรณ์ครบ',
      accessoryMissing: accessoryMissing,
      primaryPhotoCount: primaryTypes.length - missingPrimary.length,
      primaryPhotoTotal: primaryTypes.length,
      primaryPhotoComplete: missingPrimary.length === 0,
      totalPhotoCount: filledTypes.length,
      totalPhotoTotal: CONFIG.IMAGE_TYPES.length,
      missingPrimary: missingPrimary.map(function(type) { return primaryLabels[type]; }),
      workStatus: blockers.length ? (installBlocked ? 'ติดปัญหา' : 'ยังไม่จบ') : 'งานจบ',
      blockers: blockers,
      nextAction: blockers.length ? blockers.join(' · ') : 'ไม่เหลือรายการค้าง'
    };
  });

  return rows.sort(function(left, right) {
    return comparePortalSortText_(left.building, right.building) ||
      comparePortalSortText_(left.floor, right.floor) ||
      comparePortalSortText_(left.department, right.department) ||
      comparePortalSortText_(left.room, right.room) ||
      comparePortalSortText_(left.jobNo, right.jobNo);
  });
}

function comparePortalSortText_(left, right) {
  const a = String(left || '').trim();
  const b = String(right || '').trim();
  if (!a && b) return 1;
  if (a && !b) return -1;
  if (!a && !b) return 0;
  const aNumber = a.match(/\d+(?:\.\d+)?/);
  const bNumber = b.match(/\d+(?:\.\d+)?/);
  if (aNumber && bNumber && Number(aNumber[0]) !== Number(bNumber[0])) return Number(aNumber[0]) - Number(bNumber[0]);
  return a.localeCompare(b, 'th', { numeric: true, sensitivity: 'base' });
}

function getPhotoIndexByJob_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(CONFIG.PHOTO_FILE_INDEX_SHEET_NAME);
  const result = {};
  if (!sheet || sheet.getLastRow() < 2) return result;
  const values = sheet.getDataRange().getDisplayValues();
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const jobKey = String(values[rowIndex][1] || '').trim().toLowerCase();
    if (!jobKey) continue;
    const record = {};
    CONFIG.IMAGE_TYPES.forEach(function(type, typeIndex) {
      record[type] = values[rowIndex][3 + typeIndex] || '';
    });
    result[jobKey] = record;
  }
  return result;
}

function buildPortalDashboard_(rows, jobWorkRows) {
  // สถานะชุดอุปกรณ์เสริมมีเพียง 2 ค่า ไม่เกี่ยวกับสถานะเตรียมเครื่อง
  const statuses = ['รอส่งมอบ', 'ส่งมอบแล้ว'];
  const counts = {};
  statuses.forEach(function(status) { counts[status] = 0; });
  const prepCounts = {};
  CONFIG.PREP_STATUS_OPTIONS.forEach(function(status) { prepCounts[status] = 0; });
  rows.forEach(function(row) {
    if (counts[row.status] === undefined) counts[row.status] = 0;
    counts[row.status] += 1;
    const prepStatus = row.prepStatus || CONFIG.PREP_STATUS_OPTIONS[0];
    if (prepCounts[prepStatus] === undefined) prepCounts[prepStatus] = 0;
    prepCounts[prepStatus] += 1;
  });
  return {
    total: rows.length,
    deliveryCompleted: counts['ส่งมอบแล้ว'] || 0,
    deliveryPending: counts['รอส่งมอบ'] || 0,
    prepWindows: prepCounts['ลง Windows'] || 0,
    prepReady: prepCounts['พร้อมติดตั้ง'] || 0,
    prepInstalled: prepCounts['ติดตั้งเสร็จ'] || 0,
    prepInProgress: (prepCounts['ลงโปรแกรม'] || 0) + (prepCounts['รอ Activate'] || 0),
    prepReceived: prepCounts['รับเข้าแล้ว'] || 0,
    prepBlocked: prepCounts['ติดปัญหา'] || 0,
    upsBundle: rows.filter(function(row) { return row.deliverUps; }).length,
    expiring: rows.filter(function(row) { return row.alert === 'เตือน: ใกล้หมดสัญญา'; }).length,
    statuses: counts,
    prepStatuses: prepCounts,
    workTotal: (jobWorkRows || []).length,
    workCompleted: (jobWorkRows || []).filter(function(row) { return row.workStatus === 'งานจบ'; }).length,
    workPending: (jobWorkRows || []).filter(function(row) { return row.workStatus === 'ยังไม่จบ'; }).length,
    workBlocked: (jobWorkRows || []).filter(function(row) { return row.workStatus === 'ติดปัญหา'; }).length,
    workAccessoryIncomplete: (jobWorkRows || []).filter(function(row) { return row.accessoryMissing.length > 0; }).length,
    workPhotoIncomplete: (jobWorkRows || []).filter(function(row) { return !row.primaryPhotoComplete; }).length
  };
}

function toPortalValue_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Utilities.formatDate(value, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  return value;
}

function toPortalDate_(value) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  return String(value);
}

function parsePortalDate_(value) {
  if (!value) return '';
  const match = String(value).match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (!match) return value;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toBoolean_(value) {
  if (value === true || value === 1) return true;
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === 'มี' || text === '1' || text === 'yes' || text === 'y' || text === '✓';
}

/**
 * สร้าง PDF A4 เฉพาะชีทรายงานของ Job ที่เลือก แล้วเก็บไว้ในโฟลเดอร์ Drive
 */
function createJobPdf(jobNo) {
  if (!jobNo) {
    throw new Error('กรุณาเลือก Job ก่อนสั่งพิมพ์');
  }

    const spreadsheet = getSpreadsheet_();
  const sheet = ensureJobSheet_(jobNo);
  const filledTypes = getFilledImageTypes_(sheet);
  if (!filledTypes.length) throw new Error('งานนี้ยังไม่มีรูป กรุณาใส่รูปอย่างน้อย 1 ช่องก่อนสั่งพิมพ์');
  const isComplete = filledTypes.length === CONFIG.IMAGE_TYPES.length;
  const exportUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID + '/export' +
    '?format=pdf' +
    '&exportFormat=pdf' +
    '&gid=' + sheet.getSheetId() +
    '&size=A4' +
    '&portrait=true' +
    '&fitw=true' +
    '&scale=4' +
    '&sheetnames=false' +
    '&printtitle=false' +
    '&pagenum=UNDEFINED' +
    '&gridlines=false' +
    '&fzr=false' +
    '&horizontal_alignment=CENTER' +
    '&vertical_alignment=TOP' +
    '&top_margin=0.20' +
    '&bottom_margin=0.20' +
    '&left_margin=0.20' +
    '&right_margin=0.20';

  const response = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('สร้าง PDF ไม่สำเร็จ (HTTP ' + response.getResponseCode() + ')');
  }

  const filename = buildPdfFilename_(jobNo);
  const pdfBlob = response.getBlob().setName(filename);
  const file = DriveApp.getFolderById(CONFIG.PDF_FOLDER_ID).createFile(pdfBlob);
  const sourceSheetUrl = buildSheetEditUrl_(sheet);
  const status = isComplete ? 'ครบทุกช่อง' : 'ยังไม่ครบทุกช่อง';
  upsertPdfIndex_(jobNo, sheet, file, filledTypes.length, status);

  return {
    message: 'อ่านจากชีต ' + sheet.getName() + ' แล้วสร้าง PDF A4 ใหม่ใน Drive สำหรับ ' + jobNo + ' (' + filledTypes.length + '/' + CONFIG.IMAGE_TYPES.length + ' รูป, ' + status + ')',
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    filename: filename,
    sourceSheetName: sheet.getName(),
    sourceSheetUrl: sourceSheetUrl,
    createdAt: new Date(),
    filledCount: filledTypes.length,
    status: status
  };
}

/**
 * รับรูปจาก Sidebar บันทึกลงโฟลเดอร์ Drive และแทรกรูปลงเทมเพลต Photo_Report
 * รูปจะถูกแทรกเป็น Over-grid image จึงไม่จำเป็นต้องเปิดไฟล์เป็นสาธารณะ
 */
function uploadImageToSheet(jobNo, location, imageType, base64Data, originalFilename, installDate, originalBase64Data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const targetCell = CONFIG.IMAGE_CELL_MAP[imageType];
    if (!targetCell) throw new Error('ไม่พบตำแหน่งสำหรับประเภทรูป: ' + imageType);
    if (!jobNo || !base64Data) throw new Error('กรุณาเลือก Job และไฟล์รูปภาพ');

    const sheet = ensureJobSheet_(jobNo);
    const imageBlob = dataUrlToImageBlob_(base64Data, originalFilename);
    const originalBlob = originalBase64Data
      ? dataUrlToImageBlob_(originalBase64Data, originalFilename)
      : imageBlob;
    sheet.getRange(CONFIG.JOB_CELL).setValue(jobNo);
    sheet.getRange(CONFIG.LOCATION_CELL).setValue(location || '');
    sheet.getRange(CONFIG.DATE_CELL).setValue(parsePortalDate_(installDate) || new Date());
    // รูปที่ผ่านการย่อจะถูกแทรกลงชีตเพื่อพิมพ์ A4 ก่อน จากนั้นจึงเก็บไฟล์และ URL ลงดัชนีประวัติ
    insertImageInTemplate_(sheet, imageBlob, targetCell);
    const folder = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID);
    const savedFile = folder.createFile(originalBlob);
    savedFile.setName(buildPhotoFilename_(jobNo, imageType, originalFilename));
    const replacedDriveResult = trashPhotoFilesForSlot_(jobNo, imageType, savedFile.getId());
    if (replacedDriveResult.error) throw new Error('ย้ายไฟล์รูปเดิมใน Drive ลงถังขยะไม่สำเร็จ: ' + replacedDriveResult.error);
    appendPhotoFileIndex_(jobNo, imageType, originalFilename, savedFile, sheet.getName());
    SpreadsheetApp.flush();
    return 'บันทึกรูปภาพเรียบร้อยแล้ว: ' + imageType;
  } catch (error) {
    console.error(error);
    throw new Error(error.message || 'ไม่สามารถบันทึกรูปภาพได้');
  } finally {
    lock.releaseLock();
  }
}

/**
 * ลบรูปออกจากช่องของ Job ที่เลือก และย้ายไฟล์ต้นฉบับของช่องนั้นใน Drive ลงถังขยะ
 */
function deleteImageFromSheet(jobNo, location, imageType, installDate) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const targetCell = CONFIG.IMAGE_CELL_MAP[imageType];
    if (!targetCell) throw new Error('ไม่พบตำแหน่งสำหรับประเภทรูป: ' + imageType);
    if (!jobNo) throw new Error('กรุณาเลือก Job ก่อนลบรูป');

    const sheet = getSpreadsheet_().getSheetByName(buildJobSheetName_(jobNo));
    if (!sheet) throw new Error('ยังไม่มีรายงานของ Job นี้');
    const driveResult = trashPhotoFilesForSlot_(jobNo, imageType);
    if (driveResult.error) throw new Error('ย้ายไฟล์ต้นฉบับใน Drive ลงถังขยะไม่สำเร็จ: ' + driveResult.error);
    const targetRange = sheet.getRange(targetCell);
    const mergedRanges = targetRange.getMergedRanges();
    const imageArea = mergedRanges.length > 0 ? mergedRanges[0] : targetRange;
    const anchorCell = imageArea.getCell(1, 1);
    removeImageAtAnchor_(sheet, anchorCell.getA1Notation());
    clearPhotoFileIndexUrl_(jobNo, imageType);
    sheet.getRange(CONFIG.JOB_CELL).setValue(jobNo);
    sheet.getRange(CONFIG.LOCATION_CELL).setValue(location || '');
    sheet.getRange(CONFIG.DATE_CELL).setValue(parsePortalDate_(installDate) || new Date());
    SpreadsheetApp.flush();

    const filledTypes = getFilledImageTypes_(sheet);
    return {
      message: 'ลบรูปช่อง ' + imageType + ' แล้ว และย้ายไฟล์ต้นฉบับ ' + driveResult.trashedCount + ' ไฟล์ลงถังขยะ สามารถใส่รูปใหม่ได้',
      filledTypes: filledTypes,
      complete: filledTypes.length === CONFIG.IMAGE_TYPES.length,
      trashedCount: driveResult.trashedCount
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ตรวจสอบการตั้งค่าหลักจาก Editor ได้โดยตรง หากต้องการทดสอบสิทธิ์ก่อนใช้งาน
 */
function checkPhotoReportSetup() {
  const spreadsheet = getSpreadsheet_();
  const templateSheet = spreadsheet.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
  const assetSheet = spreadsheet.getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  const folder = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID);

  const pdfFolder = DriveApp.getFolderById(CONFIG.PDF_FOLDER_ID);

  return {
    spreadsheetName: spreadsheet.getName(),
    templateSheetFound: !!templateSheet,
    assetMasterSheetFound: !!assetSheet,
    photoFolderName: folder.getName(),
    photoFolderId: CONFIG.PHOTO_FOLDER_ID,
    pdfFolderName: pdfFolder.getName(),
    pdfFolderId: CONFIG.PDF_FOLDER_ID
  };
}

function ensurePdfIndexSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.PDF_INDEX_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.PDF_INDEX_SHEET_NAME);
  const headers = CONFIG.PDF_INDEX_HEADERS;
  const currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
    : [];
  const headerMatches = headers.every(function(header, index) { return currentHeaders[index] === header; });
  if (!headerMatches) sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#eadcf8');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function findPdfIndexRow_(sheet, jobNo) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const jobs = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const target = String(jobNo || '');
  for (let index = 0; index < jobs.length; index += 1) {
    if (String(jobs[index][0] || '') === target) return index + 2;
  }
  return 0;
}

function upsertPdfIndex_(jobNo, sourceSheet, file, filledCount, status) {
  const sheet = ensurePdfIndexSheet_();
  let rowNumber = findPdfIndexRow_(sheet, jobNo);
  if (!rowNumber) rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, CONFIG.PDF_INDEX_HEADERS.length).setValues([[
    String(jobNo || ''),
    sourceSheet.getName(),
    buildSheetEditUrl_(sourceSheet),
    new Date(),
    file.getName(),
    file.getUrl(),
    filledCount,
    String(status || '')
  ]]);
}

function findLatestPdfFile_(jobNo) {
  const safeJobNo = String(jobNo || '').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  const prefix = 'Photo_Report_' + safeJobNo + '_';
  const files = DriveApp.getFolderById(CONFIG.PDF_FOLDER_ID).getFiles();
  let latest = null;
  while (files.hasNext()) {
    const file = files.next();
    if (file.isTrashed() || file.getName().indexOf(prefix) !== 0) continue;
    if (!latest || file.getDateCreated().getTime() > latest.getDateCreated().getTime()) latest = file;
  }
  return latest;
}

function getLatestJobPdf(jobNo) {
  if (!jobNo) throw new Error('กรุณาเลือก Job ก่อนเปิด PDF');
  const spreadsheet = getSpreadsheet_();
  const sourceSheet = spreadsheet.getSheetByName(buildJobSheetName_(jobNo));
  const sourceSheetName = sourceSheet ? sourceSheet.getName() : buildJobSheetName_(jobNo);
  const sourceSheetUrl = sourceSheet ? buildSheetEditUrl_(sourceSheet) : buildSpreadsheetEditUrl_();
  const indexSheet = ensurePdfIndexSheet_();
  const rowNumber = findPdfIndexRow_(indexSheet, jobNo);
  if (rowNumber) {
    const row = indexSheet.getRange(rowNumber, 1, 1, CONFIG.PDF_INDEX_HEADERS.length).getDisplayValues()[0];
    if (row[5]) {
      return {
        found: true,
        jobNo: row[0],
        sourceSheetName: row[1],
        sourceSheetUrl: row[2],
        createdAt: row[3],
        filename: row[4],
        fileUrl: row[5],
        filledCount: row[6],
        status: row[7]
      };
    }
  }
  const latestFile = findLatestPdfFile_(jobNo);
  if (!latestFile) return { found: false, sourceSheetName: sourceSheetName, sourceSheetUrl: sourceSheetUrl };
  return {
    found: true,
    jobNo: String(jobNo),
    sourceSheetName: sourceSheetName,
    sourceSheetUrl: sourceSheetUrl,
    createdAt: latestFile.getDateCreated(),
    filename: latestFile.getName(),
    fileUrl: latestFile.getUrl(),
    filledCount: '',
    status: 'ไฟล์เดิมจาก Drive'
  };
}

function ensurePhotoFileIndexSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(CONFIG.PHOTO_FILE_INDEX_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.PHOTO_FILE_INDEX_SHEET_NAME);

  const expectedHeaders = CONFIG.PHOTO_FILE_INDEX_HEADERS;
  const currentHeaders = sheet.getLastColumn() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expectedHeaders.length)).getValues()[0]
    : [];
  const headerMatches = expectedHeaders.every(function(header, index) {
    return currentHeaders[index] === header;
  });
  if (!headerMatches) sheet.clearContents();

  sheet.getRange(1, 1, 1, expectedHeaders.length)
    .setValues([expectedHeaders])
    .setFontWeight('bold')
    .setBackground('#d9eaf7');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, expectedHeaders.length);
  return sheet;
}

function getPhotoFileIndexColumnIndex_(imageType) {
  const index = CONFIG.PHOTO_FILE_INDEX_HEADERS.indexOf(imageType);
  if (index < 0) throw new Error('ไม่พบคอลัมน์ประเภทรูปใน Photo_File_Index: ' + imageType);
  return index;
}

function findPhotoFileIndexRow_(sheet, jobNo) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const targetJobNo = String(jobNo || '');
  const jobs = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (let index = 0; index < jobs.length; index += 1) {
    if (String(jobs[index][0] || '') === targetJobNo) return index + 2;
  }
  return 0;
}

function extractDriveFileId_(url) {
  const text = String(url || '');
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/
  ];
  for (let index = 0; index < patterns.length; index += 1) {
    const match = text.match(patterns[index]);
    if (match) return match[1];
  }
  return '';
}

function trashPhotoFilesForSlot_(jobNo, imageType, keepFileId) {
  const result = { trashedCount: 0, error: '' };
  try {
    const safeJobNo = String(jobNo || '').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const prefix = safeJobNo + '_' + imageType + '_';
    const folder = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID);
    const files = folder.searchFiles('trashed = false');
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().indexOf(prefix) !== 0) continue;
      if (keepFileId && file.getId() === keepFileId) continue;
      file.setTrashed(true);
      result.trashedCount += 1;
    }
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  }
  return result;
}

function clearPhotoFileIndexUrl_(jobNo, imageType) {
  const sheet = ensurePhotoFileIndexSheet_();
  const rowNumber = findPhotoFileIndexRow_(sheet, jobNo);
  if (!rowNumber) return;
  const columnIndex = getPhotoFileIndexColumnIndex_(imageType) + 1;
  sheet.getRange(rowNumber, 1).setValue(new Date());
  sheet.getRange(rowNumber, columnIndex).clearContent();
}

function upsertPhotoFileIndexUrl_(jobNo, imageType, fileUrl, reportSheetName, updatedAt) {
  const sheet = ensurePhotoFileIndexSheet_();
  let rowNumber = findPhotoFileIndexRow_(sheet, jobNo);
  let row;
  if (rowNumber) {
    row = sheet.getRange(rowNumber, 1, 1, CONFIG.PHOTO_FILE_INDEX_HEADERS.length).getValues()[0];
  } else {
    rowNumber = sheet.getLastRow() + 1;
    row = Array(CONFIG.PHOTO_FILE_INDEX_HEADERS.length).fill('');
  }
  row[0] = updatedAt || new Date();
  row[1] = String(jobNo || '');
  row[2] = String(reportSheetName || buildJobSheetName_(jobNo));
  row[getPhotoFileIndexColumnIndex_(imageType)] = String(fileUrl || '');
  sheet.getRange(rowNumber, 1, 1, CONFIG.PHOTO_FILE_INDEX_HEADERS.length).setValues([row]);
  return rowNumber;
}

function appendPhotoFileIndex_(jobNo, imageType, originalFilename, file, reportSheetName) {
  upsertPhotoFileIndexUrl_(jobNo, imageType, file.getUrl(), reportSheetName, new Date());
}

/**
 * สร้าง/อัปเดตประวัติ URL จากไฟล์รูปเก่าที่มีอยู่ในโฟลเดอร์ Drive
 * จะรวมไฟล์ล่าสุดของแต่ละช่องไว้ในหนึ่งแถวต่อ Job
 */
function backfillPhotoFileIndex() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const updated = backfillPhotoFileIndex_();
    SpreadsheetApp.getUi().alert('อัปเดต URL รูปใน Photo_File_Index แล้ว ' + updated + ' ช่อง');
  } finally {
    lock.releaseLock();
  }
}

function backfillPhotoFileIndex_() {
  const latestByJob = {};
  const folder = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID);
  const files = folder.searchFiles('trashed = false');
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    let imageType = '';
    let jobNo = '';
    CONFIG.IMAGE_TYPES.some(function(candidate) {
      const marker = '_' + candidate + '_';
      const markerIndex = name.indexOf(marker);
      if (markerIndex <= 0) return false;
      imageType = candidate;
      jobNo = name.substring(0, markerIndex);
      return true;
    });
    if (!jobNo || !imageType) continue;
    const created = file.getDateCreated();
    latestByJob[jobNo] = latestByJob[jobNo] || {};
    if (!latestByJob[jobNo][imageType] || created.getTime() > latestByJob[jobNo][imageType].created.getTime()) {
      latestByJob[jobNo][imageType] = { url: file.getUrl(), created: created };
    }
  }

  let updated = 0;
  Object.keys(latestByJob).forEach(function(jobNo) {
    Object.keys(latestByJob[jobNo]).forEach(function(imageType) {
      const sheet = ensurePhotoFileIndexSheet_();
      const rowNumber = findPhotoFileIndexRow_(sheet, jobNo);
      const columnIndex = getPhotoFileIndexColumnIndex_(imageType);
      const currentUrl = rowNumber ? sheet.getRange(rowNumber, columnIndex + 1).getDisplayValue() : '';
      const fileInfo = latestByJob[jobNo][imageType];
      if (currentUrl === fileInfo.url) return;
      upsertPhotoFileIndexUrl_(jobNo, imageType, fileInfo.url, buildJobSheetName_(jobNo), fileInfo.created);
      updated += 1;
    });
  });
  return updated;
}

function ensureJobSheet_(jobNo) {
  const spreadsheet = getSpreadsheet_();
  const sheetName = buildJobSheetName_(jobNo);
  const existing = spreadsheet.getSheetByName(sheetName);
  if (existing) return existing;

  const template = spreadsheet.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
  if (!template) {
    throw new Error('ไม่พบชีทเทมเพลต ' + CONFIG.TEMPLATE_SHEET_NAME);
  }

  const jobSheet = template.copyTo(spreadsheet);
  jobSheet.setName(sheetName);
  jobSheet.getRange(CONFIG.JOB_CELL).setValue(jobNo);
  return jobSheet;
}

function buildJobSheetName_(jobNo) {
  const safeJobNo = String(jobNo)
    .trim()
    .replace(/[\\\\/?*\[\]:]/g, '_')
    .replace(/^'+|'+$/g, '')
    .substring(0, 85);
  return 'REPORT_' + (safeJobNo || 'UNNAMED_JOB');
}

function getFilledImageTypes_(sheet) {
  const anchors = {};
  sheet.getImages().forEach(function(image) {
    const anchor = image.getAnchorCell();
    if (anchor) anchors[anchor.getA1Notation()] = true;
  });

  return CONFIG.IMAGE_TYPES.filter(function(imageType) {
    return !!anchors[CONFIG.IMAGE_CELL_MAP[imageType]];
  });
}

function buildPdfFilename_(jobNo) {
  const safeJobNo = String(jobNo).replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  const timestamp = Utilities.formatDate(new Date(), CONFIG.TIME_ZONE, 'yyyyMMdd_HHmmss');
  return 'Photo_Report_' + safeJobNo + '_' + timestamp + '.pdf';
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function buildSpreadsheetEditUrl_() {
  return 'https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID + '/edit';
}

function buildSheetEditUrl_(sheet) {
  return buildSpreadsheetEditUrl_() + '#gid=' + sheet.getSheetId();
}

function dataUrlToImageBlob_(dataUrl, filename) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('รูปภาพมีรูปแบบข้อมูลไม่ถูกต้อง');
  }

  const contentType = match[1].toLowerCase();
  const allowedTypes = {
    'image/jpeg': true,
    'image/png': true,
    'image/gif': true,
    'image/webp': true
  };

  if (!allowedTypes[contentType]) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG, GIF หรือ WEBP');
  }

  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > CONFIG.MAX_IMAGE_BYTES) {
    throw new Error('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 10 MB');
  }

  return Utilities.newBlob(bytes, contentType, filename || 'photo');
}

function buildPhotoFilename_(jobNo, imageType, originalFilename) {
  const safeJobNo = String(jobNo).replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
  const safeOriginalName = String(originalFilename || 'photo')
    .replace(/[^a-zA-Z0-9ก-๙._-]/g, '_');
  const timestamp = Utilities.formatDate(
    new Date(),
    CONFIG.TIME_ZONE,
    'yyyyMMdd_HHmmss'
  );

  return [safeJobNo, imageType, timestamp, safeOriginalName].join('_');
}

function insertImageInTemplate_(sheet, blob, targetCell) {
  const targetRange = sheet.getRange(targetCell);
  const mergedRanges = targetRange.getMergedRanges();
  const imageArea = mergedRanges.length > 0 ? mergedRanges[0] : targetRange;
  const anchorCell = imageArea.getCell(1, 1);

  removeImageAtAnchor_(sheet, anchorCell.getA1Notation());

  const image = sheet.insertImage(
    blob,
    imageArea.getColumn(),
    imageArea.getRow()
  );
  image.setAnchorCell(anchorCell);
  image.setAltTextTitle('Photo Report - ' + targetCell);
  image.setAltTextDescription('รูปภาพสำหรับ ' + targetCell);

  const areaWidth = getRangePixelWidth_(sheet, imageArea);
  const areaHeight = getRangePixelHeight_(sheet, imageArea);
  const maxWidth = Math.max(80, areaWidth - 12);
  const maxHeight = Math.max(80, areaHeight - 12);
  const inherentWidth = image.getInherentWidth();
  const inherentHeight = image.getInherentHeight();
  let finalWidth = maxWidth;
  let finalHeight = maxHeight;

  if (inherentWidth > 0 && inherentHeight > 0) {
    const scale = Math.min(maxWidth / inherentWidth, maxHeight / inherentHeight);
    finalWidth = Math.max(1, Math.round(inherentWidth * scale));
    finalHeight = Math.max(1, Math.round(inherentHeight * scale));
  }

  image.setWidth(finalWidth);
  image.setHeight(finalHeight);
  // OverGridImage ไม่มี setLeft/setTop; offset ต้องอ้างอิงจากเซลล์ anchor
  image.setAnchorCellXOffset(Math.max(0, Math.round((areaWidth - finalWidth) / 2)));
  image.setAnchorCellYOffset(Math.max(0, Math.round((areaHeight - finalHeight) / 2)));
}

function getRangePixelWidth_(sheet, range) {
  let width = 0;
  const start = range.getColumn();
  const end = start + range.getNumColumns() - 1;
  for (let column = start; column <= end; column += 1) {
    width += sheet.getColumnWidth(column);
  }
  return width;
}

function getRangePixelHeight_(sheet, range) {
  let height = 0;
  const start = range.getRow();
  const end = start + range.getNumRows() - 1;
  for (let row = start; row <= end; row += 1) {
    height += sheet.getRowHeight(row);
  }
  return height;
}

function getRangePixelLeft_(sheet, range) {
  let left = 0;
  for (let column = 1; column < range.getColumn(); column += 1) {
    left += sheet.getColumnWidth(column);
  }
  return left;
}

function getRangePixelTop_(sheet, range) {
  let top = 0;
  for (let row = 1; row < range.getRow(); row += 1) {
    top += sheet.getRowHeight(row);
  }
  return top;
}

function removeImageAtAnchor_(sheet, a1Notation) {
  const requestedRange = sheet.getRange(a1Notation);
  const mergedRanges = requestedRange.getMergedRanges();
  const imageArea = mergedRanges.length > 0 ? mergedRanges[0] : requestedRange;
  const minRow = imageArea.getRow();
  const minColumn = imageArea.getColumn();
  const maxRow = minRow + imageArea.getNumRows() - 1;
  const maxColumn = minColumn + imageArea.getNumColumns() - 1;

  sheet.getImages().forEach(function(image) {
    const anchor = image.getAnchorCell();
    if (!anchor) return;
    const row = anchor.getRow();
    const column = anchor.getColumn();
    if (row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn) image.remove();
  });
}
