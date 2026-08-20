# Photo Report original design responsive check

ตรวจ `Sidebar.html` หลังคืนค่าดีไซน์ Bento เดิมจาก commit 4098a70 และเพิ่มเฉพาะ media query สำหรับมือถือ.

ที่ viewport 390x844 และ 412x915 CSS px หน้าใช้ความกว้างเต็มจอ ไม่มีกรอบ Desktop ด้านข้าง การ์ดก่อนติดตั้งและหลังติดตั้งเรียงเป็นคอลัมน์เดียว ช่องรูป 1–4 ยังอยู่ในแต่ละการ์ด และสี/ลำดับ/องค์ประกอบหลักของดีไซน์เดิมยังคงเดิม.

การทดสอบ syntax JavaScript ที่ฝังใน Sidebar.html และ git diff --check ผ่านแล้ว.
