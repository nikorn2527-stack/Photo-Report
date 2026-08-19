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
  PHOTO_FOLDER_ID: '1CU2xREGuoBjzjDVYMfra_KylHGpUd1Re',
  PDF_FOLDER_ID: '1CU2xREGuoBjzjDVYMfra_KylHGpUd1Re',
  TIME_ZONE: 'Asia/Bangkok',
  HEADER_ROW: 4,
  JOB_CELL: 'B4',
  LOCATION_CELL: 'D4',
  DATE_CELL: 'H4',
  MAX_IMAGE_BYTES: 2 * 1024 * 1024,
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
  ])
});

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('ระบบจัดการรูปภาพ')
    .addItem('เปิดหน้าต่างอัปโหลดรูป', 'showSidebar')
    .addToUi();
}

/**
 * Entry point สำหรับการ Deploy เป็น Web App
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const page = String(params.page || params.mode || params.view || '').toLowerCase();
  const fileName = page === 'asset' || page === 'manage' || page === 'assetmaster'
    ? 'AssetMaster'
    : 'Sidebar';
  const title = fileName === 'AssetMaster' ? 'จัดการ Asset_Master' : 'อัปโหลดรูปภาพ Photo Report';
  return HtmlService.createHtmlOutputFromFile(fileName)
    .setTitle(title);
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('อัปโหลดรูปภาพ Photo Report')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * อ่านรายการ Job จาก Asset_Master
 * โครงสร้างเดิมของไฟล์เริ่มข้อมูลที่แถว 4:
 * A = Job No., D:G = อาคาร ชั้น แผนก ห้อง
 */
function getJobData() {
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.ASSET_MASTER_SHEET_NAME);
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  const jobs = [];

  for (let row = CONFIG.HEADER_ROW - 1; row < values.length; row += 1) {
    const jobNo = values[row][0];
    if (!jobNo) continue;

    const jobText = String(jobNo).trim();
    if (jobText.indexOf('JOB-') === -1) continue;

    const locationParts = [
      values[row][3],
      values[row][4],
      values[row][5],
      values[row][6]
    ].filter(function(value) {
      return value !== '' && value !== null && value !== undefined;
    });

    jobs.push({
      jobNo: jobText,
      location: locationParts.join(' ')
    });
  }

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
 * คืนสถานะงานของ Job ที่เลือก เพื่อใช้ย้อนกลับมาทำต่อภายหลัง
 */
function getJobProgress(jobNo) {
  if (!jobNo) {
    throw new Error('ไม่พบเลข Job');
  }

  const sheetName = buildJobSheetName_(jobNo);
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    return {
      exists: false,
      sheetName: sheetName,
      jobNo: String(jobNo),
      location: '',
      filledTypes: []
    };
  }

  return {
    exists: true,
    sheetName: sheetName,
    jobNo: String(jobNo),
    location: sheet.getRange(CONFIG.LOCATION_CELL).getDisplayValue(),
    filledTypes: getFilledImageTypes_(sheet)
  };
}

/**
 * สร้าง/บันทึกชีทรายงานแยกตาม Job เพื่อไม่ให้งานที่ยังไม่เสร็จถูกทับ
 */
function saveJobProgress(jobNo, location) {
  if (!jobNo) {
    throw new Error('กรุณาเลือก Job ก่อนบันทึก');
  }

  const sheet = ensureJobSheet_(jobNo);
  sheet.getRange(CONFIG.JOB_CELL).setValue(jobNo);
  sheet.getRange(CONFIG.LOCATION_CELL).setValue(location || '');
  sheet.getRange(CONFIG.DATE_CELL).setValue(new Date());
  SpreadsheetApp.flush();

  return {
    message: 'บันทึกงาน ' + jobNo + ' แล้ว สามารถกลับมาทำต่อภายหลังได้',
    sheetName: sheet.getName(),
    filledTypes: getFilledImageTypes_(sheet)
  };
}

/**
 * คืน URL ของชีทรายงานแยกตาม Job เพื่อเปิดดูหรือสั่งพิมพ์จาก Google Sheets
 */
function getJobReportInfo(jobNo) {
  if (!jobNo) throw new Error('กรุณาระบุ Job');
  const sheet = ensureJobSheet_(jobNo);
  const spreadsheet = getSpreadsheet_();
  SpreadsheetApp.flush();
  return {
    sheetName: sheet.getName(),
    sheetUrl: spreadsheet.getUrl() + '#gid=' + sheet.getSheetId()
  };
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

  return {
    message: 'สร้าง PDF A4 สำหรับ ' + jobNo + ' เรียบร้อยแล้ว',
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    filename: filename
  };
}

/**
 * รับรูปจาก Sidebar บันทึกลงโฟลเดอร์ Drive และแทรกรูปลงเทมเพลต Photo_Report
 * รูปจะถูกแทรกเป็น Over-grid image จึงไม่จำเป็นต้องเปิดไฟล์เป็นสาธารณะ
 */
function uploadImageToSheet(jobNo, location, imageType, base64Data, originalFilename) {
  try {
    const targetCell = CONFIG.IMAGE_CELL_MAP[imageType];
    if (!targetCell) {
      throw new Error('ไม่พบตำแหน่งสำหรับประเภทรูป: ' + imageType);
    }

    if (!jobNo || !base64Data) {
      throw new Error('กรุณาเลือก Job และไฟล์รูปภาพ');
    }

    const spreadsheet = getSpreadsheet_();
    const sheet = ensureJobSheet_(jobNo);

    const imageBlob = dataUrlToImageBlob_(base64Data, originalFilename);
    const folder = DriveApp.getFolderById(CONFIG.PHOTO_FOLDER_ID);
    const savedFile = folder.createFile(imageBlob);
    savedFile.setName(buildPhotoFilename_(jobNo, imageType, originalFilename));

    sheet.getRange(CONFIG.JOB_CELL).setValue(jobNo);
    sheet.getRange(CONFIG.LOCATION_CELL).setValue(location || '');
    sheet.getRange(CONFIG.DATE_CELL).setValue(new Date());

    insertImageInTemplate_(sheet, imageBlob, targetCell);
    SpreadsheetApp.flush();

    return 'บันทึกรูปภาพเรียบร้อยแล้ว: ' + imageType;
  } catch (error) {
    console.error(error);
    throw new Error(error.message || 'ไม่สามารถบันทึกรูปภาพได้');
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
    throw new Error('ไฟล์รูปภาพต้องมีขนาดไม่เกิน 2 MB');
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

  const maxWidth = Math.max(50, imageArea.getWidth() - 8);
  const maxHeight = Math.max(50, imageArea.getHeight() - 8);
  const inherentWidth = image.getInherentWidth();
  const inherentHeight = image.getInherentHeight();

  if (inherentWidth > 0 && inherentHeight > 0) {
    const scale = Math.min(
      maxWidth / inherentWidth,
      maxHeight / inherentHeight
    );
    image.setWidth(Math.max(1, Math.round(inherentWidth * scale)));
    image.setHeight(Math.max(1, Math.round(inherentHeight * scale)));
  } else {
    image.setWidth(maxWidth);
    image.setHeight(maxHeight);
  }
}

function removeImageAtAnchor_(sheet, a1Notation) {
  sheet.getImages().forEach(function(image) {
    const anchor = image.getAnchorCell();
    if (anchor && anchor.getA1Notation() === a1Notation) {
      image.remove();
    }
  });
}
