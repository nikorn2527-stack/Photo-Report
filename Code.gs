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
  })
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
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('อัปโหลดรูปภาพ Photo Report');
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
    const sheet = spreadsheet.getSheetByName(CONFIG.TEMPLATE_SHEET_NAME);
    if (!sheet) {
      throw new Error('ไม่พบชีท ' + CONFIG.TEMPLATE_SHEET_NAME);
    }

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
    return 'เกิดข้อผิดพลาด: ' + error.message;
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

  return {
    spreadsheetName: spreadsheet.getName(),
    templateSheetFound: !!templateSheet,
    assetMasterSheetFound: !!assetSheet,
    photoFolderName: folder.getName(),
    photoFolderId: CONFIG.PHOTO_FOLDER_ID
  };
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
