// ================================================================
//  Types — Hepatitis Screening System
// ================================================================

// ── Village (กลุ่มเป้าหมาย) ──────────────────────────────────────
export interface VillageRow {
  id?:      number
  moo:      string   // ม.1, ม.2 ...
  no:       string   // ลำดับ
  addr:     string   // บ้านเลขที่
  prefix:   string   // คำนำหน้า
  fname:    string   // ชื่อ
  lname:    string   // นามสกุล
  gender:   string   // เพศ
  age:      string   // อายุ(ปี)
  agem:     string   // อายุ(เดือน)
  dob:      string   // วันเกิด
  pid:      string   // เลขที่บัตรประชาชน
  right:    string   // สิทธิการรักษา
  regis:    string   // ทะเบียนบ้าน
}

// ── Screening (ข้อมูลคัดกรอง) ────────────────────────────────────
export type ScreeningType = 'HBsAg' | 'AntiHCV'

export interface ScreeningRow {
  id?:          number
  pid:          string
  type:         ScreeningType
  year:         string   // 2567, 2568, 2569
  date:         string   // d/M/YYYY
  unit:         string   // หน่วยตรวจ
  name:         string   // ชื่อ-นามสกุล (จาก KTB CSV)
  imported_at?: string
}

// ── Screening lookup ─────────────────────────────────────────────
// { HBsAg: { '2567': { pid: { dates, unit, name } } } }
export type ScreeningByYear = Record<string, { dates: string[]; unit: string; name: string }>
export type ScreeningDB = {
  HBsAg:   Record<string, ScreeningByYear>   // year → pid → {dates, unit, name}
  AntiHCV: Record<string, ScreeningByYear>
}

// ── Row with moo (for table) ─────────────────────────────────────
export interface TableRow extends VillageRow {
  moo: string
}

// ── API Response ─────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  ok:     boolean
  data?:  T
  error?: string
}

// ── KPI ──────────────────────────────────────────────────────────
export interface VillageStat {
  moo:       string
  total:     number
  hbCount:   number
  hcvCount:  number
  hbPct:     number
  hcvPct:    number
}

// ── Import ───────────────────────────────────────────────────────
export interface ImportResult {
  imported:     number
  skipped:      number
  skippedEmpty: number
  total:        number
  sheet?:       string
}

export interface SlotState {
  year:   string
  type:   ScreeningType
  loaded: boolean
  count:  number
}

export interface VilSlotState {
  loaded:  boolean
  count:   number
  loading?: boolean
  err?:    string
}

// ── Settings ─────────────────────────────────────────────────────
export interface AppConfig {
  orgName:      string
  orgDept:      string
  hbColor:      string
  hcvColor:     string
  showChart:    boolean
  showVilStats: boolean
  showDatalabel:boolean
  // คอลัมน์ในตาราง
  showNo:       boolean
  showAddr:     boolean
  showPrefix:   boolean
  showFname:    boolean
  showLname:    boolean
  showGender:   boolean
  showAge:      boolean
  showAgeM:     boolean
  showDob:      boolean
  showPid:      boolean
  showRight:    boolean
  showRegis:    boolean
  showHbDate:   boolean
  showHbUnit:   boolean
  showHcvDate:  boolean
  showHcvUnit:  boolean
  logoData:     string
}

export const DEFAULT_CONFIG: AppConfig = {
  orgName:      'โรงพยาบาลวังทรายพูน',
  orgDept:      'กลุ่มงานบริการด้านปฐมภูมิและองค์รวม',
  hbColor:      '#059669',
  hcvColor:     '#f59e0b',
  showChart:    true,
  showVilStats: true,
  showDatalabel:true,
  showNo:       true,
  showAddr:     true,
  showPrefix:   true,
  showFname:    true,
  showLname:    true,
  showGender:   true,
  showAge:      true,
  showAgeM:     true,
  showDob:      true,
  showPid:      true,
  showRight:    true,
  showRegis:    false,
  showHbDate:   true,
  showHbUnit:   true,
  showHcvDate:  true,
  showHcvUnit:  true,
  logoData:     '',
}

// ── Filter State ─────────────────────────────────────────────────
export interface FilterState {
  search:  string
  scr:     string
  gender:  string
  year:    string
  pg:      number
}