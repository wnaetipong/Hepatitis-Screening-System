# Hepatitis Screening System
ระบบติดตามการคัดกรองไวรัสตับอักเสบ บี และ ซี — โรงพยาบาลวังทรายพูน

## Stack
- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS**
- **Supabase** (PostgreSQL)
- **Vercel** (Deploy)
- **recharts** (Charts)

---

## ขั้นตอน Setup (ทำครั้งเดียว)

### 1. Clone และติดตั้ง dependencies
```bash
git clone https://github.com/YOUR_USERNAME/hepatitis-screening.git
cd hepatitis-screening
npm install
```

### 2. สร้าง Supabase tables
1. ไปที่ [supabase.com](https://supabase.com) → project ของคุณ
2. เปิด **SQL Editor**
3. วางโค้ดจากไฟล์ `supabase/schema.sql` แล้วกด **Run**

### 3. ตั้งค่า Environment Variables
แก้ไฟล์ `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

หา keys ได้ที่: Supabase Dashboard → Project Settings → API

### 4. Migrate ข้อมูลจาก Google Sheet
```bash
# วางไฟล์ xlsx ที่ export มาจาก Google Sheet ไว้ที่ root project
# ชื่อไฟล์: Hepatitis_Screening___Wangsaiphun_Hospital.xlsx

npm run migrate
```

### 5. รันในเครื่อง
```bash
npm run dev
# เปิด http://localhost:3000
```

---

## Deploy บน Vercel
1. Push โค้ดขึ้น GitHub
2. ไปที่ [vercel.com](https://vercel.com) → **Add New Project**
3. Import GitHub repo นี้
4. เพิ่ม Environment Variables ทั้ง 3 ค่าใน Vercel Dashboard
5. กด **Deploy**

---

## โครงสร้างไฟล์
```
src/
  app/
    api/
      village/route.ts      ← GET/POST กลุ่มเป้าหมาย
      screening/route.ts    ← GET ข้อมูลคัดกรอง
      import/csv/route.ts   ← POST import CSV
      settings/route.ts     ← GET/POST config
    dashboard/page.tsx      ← หน้าหลัก
  components/
    charts/     ← KpiCards, OverviewChart, DetailChart, VillageStatCards
    table/      ← DataTable
    modal/      ← PersonModal
    import/     ← ImportDrawer
    ui/         ← Button, Toast, Loading, Topbar
  hooks/        ← useVillageData, useScreeningData, useConfig
  lib/          ← supabase.ts, db.ts, utils.ts
  types/        ← TypeScript types
scripts/
  migrate-from-xlsx.ts  ← migration script (รันครั้งเดียว)
supabase/
  schema.sql            ← SQL schema
```
