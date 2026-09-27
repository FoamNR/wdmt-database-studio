<div align="center">

  <img src="docs/screenshots/logo.png" alt="WDMT Studio Logo" width="120" />

  # ⚡ WDMT — Web-based Database Management Tool
  
  **Modern, Ultra-Fast, Self-Hosted Multi-Database Studio**  
  *จัดการฐานข้อมูลผ่านเว็บเบราว์เซอร์ เรียบง่าย รวดเร็ว ปลอดภัย และทรงพลัง*

  <br />

  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-24%20LTS-green.svg?logo=nodedotjs)](https://nodejs.org/)
  [![React](https://img.shields.io/badge/React-19-cyan.svg?logo=react)](https://react.dev/)
  [![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker)](https://www.docker.com/)
  [![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

</div>

---

## 🌟 ภาพรวมระบบ (Overview)

**WDMT Studio** (Web-based Database Management Tool) เป็นเครื่องมือจัดการฐานข้อมูลยุคใหม่ที่ทำงานผ่าน Web Browser พัฒนาด้วยเทคโนโลยี React 19, TypeScript และ Node.js 24 มอบประสบการณ์การทำงานที่ลื่นไหลระดับ Desktop Application พร้อมระบบความปลอดภัยระดับองค์กร

---

## 📸 ภาพตัวอย่างการใช้งาน (Screenshots)

### 1. Monaco SQL Editor & Live Autocomplete
> เขียนคำสั่ง SQL ได้รวดเร็วพร้อมระบบ IntelliSense Autocomplete อัจฉริยะ แนะนำชื่อตาราง/คอลัมน์แบบ Real-time และตารางผลลัพธ์แบบ Virtualized

<div align="center">
  <img src="docs/screenshots/sql_editor.png" alt="SQL Editor with Autocomplete" width="95%" />
</div>

<br />

### 2. Table Structure, Schema & DDL Explorer
> ตรวจสอบโครงสร้างตาราง, ชนิดข้อมูล (Data Types), Primary Keys, Auto Increment / Identity, Foreign Keys, Indexes และดูคำสั่ง DDL (`CREATE TABLE`) ได้อย่างละเอียด

<div align="center">
  <img src="docs/screenshots/table_structure.png" alt="Table Structure View" width="95%" />
</div>

<br />

### 3. Connection Profiles & SSH Bastion Host Tunneling
> เชื่อมต่อฐานข้อมูลได้หลากหลายเครื่องยนต์ พร้อมระบบ SSH Tunneling ทะลวงเข้า Private Subnet / VPC ได้อย่างปลอดภัย

<div align="center">
  <img src="docs/screenshots/connection_modal.png" alt="Connection Profile and SSH Tunnel Modal" width="75%" />
</div>

---

## ✨ ฟังก์ชันเด่น (Key Features)

- 🗄️ **Multi-Engine SQL Support**: รองรับ 4 เครื่องยนต์ฐานข้อมูลยอดนิยม:
  - 🐘 **PostgreSQL** (12 - 17+)
  - 🐬 **MySQL / MariaDB** (5.7, 8.0, 10.x)
  - 🪶 **SQLite** (Native Sync Engine `node:sqlite`)
  - 🏢 **Microsoft SQL Server (MSSQL)** (2017, 2019, 2022)
- ⚡ **High-Performance Virtualized DataGrid**:
  - แสดงผลข้อมูลได้หลายหมื่นแถวอย่างลื่นไหลด้วย Virtual Scrolling
  - **Inline Cell Editing**: ดับเบิลคลิกแก้ไขข้อมูลในเซลล์ได้ทันที
  - เพิ่มแถวใหม่ (Insert Row Modal) พร้อมระบบ Auto-Increment / Serial Detector
- 💻 **Monaco SQL Editor (VS Code Power)**:
  - Syntax Highlighting & Formatting
  - **SQL IntelliSense / Autocomplete**: แนะนำคีย์เวิร์ด, ฟังก์ชัน, ชื่อตาราง และคอลัมน์จากฐานข้อมูลที่เชื่อมต่ออยู่
  - คีย์ลัด `Ctrl + Enter` (หรือ `Cmd + Enter`) เพื่อสั่งรัน Query ทันที
  - รองรับ Multi-Tabs แยกตารางและ Query อิสระ
- 🧱 **Schema & DDL Inspector**:
  - สำรวจ Tables, Views, Columns, Constraints, Indexes
  - สร้าง SQL DDL สำหรับนำไปสร้างตารางซ้ำได้อย่างแม่นยำ
- 🔒 **SSH Bastion Tunneling**:
  - เชื่อมต่อไปยัง Database ที่อยู่ใน Private Network ผ่าน Bastion Host (SSH Password หรือ Private Key)
  - สตรีมพอร์ตในหน่วยความจำ (In-memory stream) ไม่เปิดพอร์ตภายนอก ปลอดภัยสูงสุด
- 🔐 **AES-256-GCM Encrypted Vault**:
  - เข้ารหัสรหัสผ่านและข้อมูลสำคัญทั้งหมดด้วย Master Key เฉพาะตัว
- 🌓 **Theme Switcher**:
  - สลับระหว่าง **Light Mode** (ค่าเริ่มต้น สบายตา) และ **Dark Mode** (Linear Obsidian)
- 📦 **Data Export**:
  - ส่งออกผลลัพธ์เป็น **CSV, JSON หรือ SQL Insert Dump** ได้ในคลิกเดียว
- 🪄 **1-Click Sample Database**:
  - มีปุ่มสร้างฐานข้อมูลจำลอง E-Commerce (SQLite) ให้ทดลองใช้งานระบบได้ทันที

---

## 🛠️ สถาปัตยกรรมระบบ (Tech Stack)

| ส่วนประกอบ | เทคโนโลยี |
| :--- | :--- |
| **Backend** | Node.js 24 LTS, Express, TypeScript, `node:sqlite`, `node:crypto` |
| **Frontend** | React 19, TypeScript, Vite, Monaco Editor, Lucide Icons |
| **Drivers** | `pg` (PostgreSQL), `mysql2` (MySQL), `tedious` (MSSQL), `node:sqlite` (SQLite) |
| **Security** | `ssh2` (SSH Tunnel), AES-256-GCM Vault |
| **Deployment** | Docker Multi-stage Build, Docker Compose |

---

## 🚀 วิธีการติดตั้งและรันใช้งาน (Getting Started)

### วิธีที่ 1: รันผ่าน Docker Compose (แนะนำ สะดวกที่สุด ⭐)

1. Clone repository:
   ```bash
   git clone https://github.com/FoamNR/wdmt-database-studio.git
   cd wdmt-database-studio
   ```

2. สั่งรันด้วย Docker Compose:
   ```bash
   docker compose up -d --build
   ```

3. เข้าใช้งานผ่านเบราว์เซอร์:
   - URL: **`http://localhost:5555`**
   - *(ข้อมูล Connections และไฟล์ SQLite จะถูกจัดเก็บไว้ในโฟลเดอร์ `./data` อย่างปลอดภัย)*

---

### วิธีที่ 2: รันด้วย Node.js ในเครื่อง (Local Run)

**ความต้องการของระบบ:**
- Node.js version 22+ (แนะนำ Node.js 24)
- npm version 10+

1. ติดตั้ง Dependencies สำหรับ Server และ Client:
   ```bash
   npm install
   npm --prefix client install
   ```

2. Build โปรเจกต์:
   ```bash
   npm run build
   ```

3. สตาร์ตเซิร์ฟเวอร์:
   ```bash
   npm start
   ```
   เปิดเบราว์เซอร์ที่: **`http://localhost:3000`**

---

### วิธีที่ 3: โหมดพัฒนา (Development Mode)

```bash
# รันทั้ง Backend และ Frontend ในโหมด Dev พร้อม Hot Reloading
npm run dev
```

- **Backend API**: `http://localhost:3000`
- **Frontend Vite**: `http://localhost:5173`

---

## ⚙️ การตั้งค่าสภาพแวดล้อม (Configuration)

คุณสามารถสร้างไฟล์ `.env` ที่ root directory เพื่อกำหนดค่าเพิ่มเติม:

```ini
# Port สำหรับเปิด Web Studio (ค่าเริ่มต้น: 5555 ใน Docker, 3000 ใน Local)
WDMT_PORT=5555

# Master Encryption Key (ถ้าไม่ระบุ ระบบจะสร้าง .vault_key ให้อัตโนมัติในโฟลเดอร์ data/)
# VAULT_MASTER_KEY=your-32-byte-hex-key
```

---

## 🛡️ ความปลอดภัย (Security Architecture)

1. **Zero Cleartext Credentials**: รหัสผ่านและ Private Key จะถูกเข้ารหัสด้วย **AES-256-GCM** ทุกครั้งก่อนบันทึกลงดิสก์
2. **Sanitized Output**: API จะทำการ Masked รหัสผ่านออกเสมอเมื่อส่งข้อมูล Connection Profile กลับมาที่ Frontend
3. **In-Memory SSH Forwarding**: Tunneling ถูกจัดการผ่าน In-memory Duplex Stream และตัดการเชื่อมต่อทันทีเมื่อไม่ได้ใช้งาน
4. **Self-Hosted & Privacy-First**: ทำงาน 100% ภายในเครื่องหรือ Server ของคุณเอง ไม่มีการส่งข้อมูลใดๆ ออกนอกระบบ

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้เผยแพร่ภายใต้สัญญาอนุญาต [MIT License](LICENSE) — สามารถนำไปใช้งาน ปรับแต่ง และพัฒนาต่อได้อย่างอิสระ
