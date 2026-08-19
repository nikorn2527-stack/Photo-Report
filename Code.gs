function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📸 ระบบจัดการรูปภาพ')
    .addItem('เปิดหน้าต่างอัพโหลดรูป', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('อัพโหลดรูปภาพ Photo Report')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

// ดึงข้อมูล Job และ สถานที่ จาก Asset_Master
function getJobData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Asset_Master");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var jobs = [];
  
  // สมมติว่าข้อมูลเริ่มที่แถวที่ 4 (Index 3) ตามโครงสร้างไฟล์
  for (var i = 3; i < data.length; i++) {
    var jobNo = data[i][0]; // คอลัมน์ A (เลข Job)
    if (jobNo && jobNo.toString().indexOf('JOB-') !== -1) {
      // นำข้อมูล ตึก (D), ชั้น (E), แผนก (F), ห้อง (G) มาต่อกันเป็นสถานที่
      var building = data[i][3] || '';
      var floor = data[i][4] || '';
      var dept = data[i][5] || '';
      var room = data[i][6] || '';
      var location = [building, floor, dept, room].filter(String).join(' ');
      
      jobs.push({ jobNo: jobNo, location: location });
    }
  }
  return jobs;
}

// ฟังก์ชันรับรูปภาพและอัพโหลดลงชีท
function uploadImageToSheet(jobNo, location, imageType, base64Data, filename) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Photo_Report");
    if (!sheet) return "ไม่พบชีท Photo_Report";
    
    // 1. อัพเดทข้อมูล Job, สถานที่ และวันที่ ในเทมเพลต (แถวที่ 4)
    sheet.getRange("B4").setValue(jobNo);
    sheet.getRange("D4").setValue(location);
    sheet.getRange("H4").setValue(new Date()); 
    
    // 2. แปลงไฟล์รูปภาพ
    var splitBase = base64Data.split(',');
    var contentType = splitBase[0].split(';')[0].replace('data:', '');
    var byteCharacters = Utilities.base64Decode(splitBase[1]);
    var blob = Utilities.newBlob(byteCharacters, contentType, filename);
    
    // 3. บันทึกรูปลง Google Drive เพื่อดึง URL มาใช้กับสูตร =IMAGE()
    var folderName = "IT_Rental_Photos";
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    var file = folder.createFile(blob);
    var fileId = file.getId();
    // ตั้งค่าให้ไฟล์เปิดอ่านได้ เพื่อให้ Sheet ดึงรูปมาแสดงได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); 
    
    // 4. วางรูปลงในเซลล์ที่กำหนด
    var imageUrl = "https://drive.google.com/uc?export=view&id=" + fileId;
    var imageFormula = '=IMAGE("' + imageUrl + '", 1)'; // Mode 1: ปรับให้พอดีเซลล์
    
    // กำหนดตำแหน่งเซลล์อ้างอิงตามเทมเพลตของคุณ
    var cellMapping = {
      "signage": "A7",
      "before1": "A15",
      "after1": "E15",
      "before2": "A22",
      "after2": "E22"
    };
    
    var targetCell = cellMapping[imageType];
    if (targetCell) {
      sheet.getRange(targetCell).setFormula(imageFormula);
    }
    
    return "บันทึกรูปภาพเรียบร้อยแล้ว!";
  } catch (e) {
    return "เกิดข้อผิดพลาด: " + e.message;
  }
}