/**
 * Migration Script — Google Sheet export (.xlsx) → Supabase
 * วิธีใช้:
 *   1. วางไฟล์ Hepatitis_Screening___Wangsaiphun_Hospital.xlsx ใน root project
 *   2. ตั้งค่า .env.local ให้ครบ
 *   3. รัน: npm run migrate
 */

import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const XLSX_FILE = path.join(process.cwd(), 'Hepatitis_Screening___Wangsaiphun_Hospital.xlsx')
const VILLAGE_SHEETS   = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.9', 'ม.14']
const SCREENING_TYPES  = { HBsAg: 'HBsAg', AntiHCV: 'AntiHCV' } as const

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── Helpers ──────────────────────────────────────────────────────
function fmtAddr(val: unknown): string {
  if (!val && val !== 0) return ''
  if (val instanceof Date) return `${val.getDate()}/${val.getMonth() + 1}`
  return String(val).trim()
}

function fmtDob(val: unknown): string {
  if (!val) return ''
  if (val instanceof Date) {
    const y = val.getFullYear()
    const yr = y < 2400 ? y + 543 : y
    return `${val.getDate()}/${val.getMonth() + 1}/${yr}`
  }
  return String(val).trim().split(' ')[0]
}

function fmtDate(val: unknown): string {
  if (!val) return ''
  if (val instanceof Date) {
    return `${val.getDate()}/${val.getMonth() + 1}/${val.getFullYear()}`
  }
  const s = String(val).trim()
  // Format: D/M/YYYY หรือ YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${+iso[3]}/${+iso[2]}/${iso[1]}`
  return s.split(' ')[0]
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(XLSX_FILE)) {
    console.error(`❌ ไม่พบไฟล์: ${XLSX_FILE}`)
    console.error('วางไฟล์ Hepatitis_Screening___Wangsaiphun_Hospital.xlsx ไว้ที่ root project')
    process.exit(1)
  }

  console.log('📂 อ่านไฟล์ xlsx...')
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })

  // ── 1. Migrate villages ──────────────────────────────────────
  console.log('\n🏘️  Migration กลุ่มเป้าหมาย...')

  for (const sheetName of VILLAGE_SHEETS) {
    const ws = wb.Sheets[sheetName]
    if (!ws) { console.log(`  ⚠ ไม่พบ sheet: ${sheetName}`); continue }

    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    const headers = raw.length ? Object.keys(raw[0]) : []

    const idx = {
      no:     headers.find(h => h.includes('ลำดับ')),
      addr:   headers.find(h => h.includes('บ้านเลขที่')),
      prefix: headers.find(h => h.includes('คำนำหน้า')),
      fname:  headers.find(h => h === 'ชื่อ' || h.includes('ชื่อ')),
      lname:  headers.find(h => h.includes('นามสกุล')),
      gender: headers.find(h => h.includes('เพศ')),
      age:    headers.find(h => h.includes('อายุ(ปี)')),
      agem:   headers.find(h => h.includes('อายุ (เดือน)') || h.includes('อายุ(เดือน)')),
      dob:    headers.find(h => h.includes('วันเกิด')),
      pid:    headers.find(h => h.includes('เลขที่บัตร') || h.includes('บัตรประชาชน')),
      right:  headers.find(h => h.includes('สิทธิ')),
      regis:  headers.find(h => h.includes('ทะเบียนบ้าน')),
    }

    if (!idx.pid) { console.log(`  ⚠ ไม่พบคอลัมน์ pid ใน ${sheetName}`); continue }

    const rows = raw.flatMap((r, i) => {
      const pid = String(r[idx.pid!] ?? '').trim()
      if (!pid || pid === '0' || pid === 'undefined') return []
      return [{
        moo:    sheetName,
        no:     String(r[idx.no!]     ?? i + 1),
        addr:   fmtAddr(idx.addr   ? r[idx.addr]   : ''),
        prefix: String(r[idx.prefix!] ?? '').trim(),
        fname:  String(r[idx.fname!]  ?? '').trim(),
        lname:  String(r[idx.lname!]  ?? '').trim(),
        gender: String(r[idx.gender!] ?? '').trim(),
        age:    String(r[idx.age!]    ?? '').trim(),
        agem:   idx.agem   ? String(r[idx.agem]   ?? '').trim() : '',
        dob:    idx.dob    ? fmtDob(r[idx.dob])                : '',
        pid,
        right:  idx.right  ? String(r[idx.right]  ?? '').trim() : '',
        regis:  idx.regis  ? String(r[idx.regis]  ?? '').trim() : '',
      }]
    })

    if (!rows.length) { console.log(`  ⚠ ไม่มีข้อมูลใน ${sheetName}`); continue }

    // Delete old data for this moo
    await sb.from('villages').delete().eq('moo', sheetName)

    // Insert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      const { error } = await sb.from('villages').insert(batch)
      if (error) throw new Error(`villages ${sheetName}: ${error.message}`)
    }

    console.log(`  ✅ ${sheetName}: ${rows.length} ราย`)
  }

  // ── 2. Migrate screenings ────────────────────────────────────
  console.log('\n🔬 Migration ข้อมูลคัดกรอง...')
  const now = new Date().toISOString()

  for (const sheetName of wb.SheetNames) {
    let type: string | null = null, year: string | null = null
    if (sheetName.startsWith('HBsAg_'))   { type = 'HBsAg';   year = sheetName.replace('HBsAg_', '') }
    if (sheetName.startsWith('AntiHCV_')) { type = 'AntiHCV'; year = sheetName.replace('AntiHCV_', '') }
    if (!type || !year) continue

    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    const headers = raw.length ? Object.keys(raw[0]) : []
    const pidKey  = headers.find(h => h.toLowerCase() === 'pid' || h.includes('บัตร'))
    const dateKey = headers.find(h => h.includes('วันที่รับบริการ'))
    const unitKey = headers.find(h => h.includes('หน่วยตรวจ'))

    if (!pidKey || !dateKey) { console.log(`  ⚠ ข้ามไฟล์: ${sheetName}`); continue }

    // Collect unique pid|date
    const seen = new Set<string>()
    const rows: Record<string, unknown>[] = []

    for (const r of raw) {
      const pid  = String(r[pidKey]  ?? '').trim()
      const date = fmtDate(r[dateKey])
      const unit = unitKey ? String(r[unitKey] ?? '').trim() : ''
      if (!pid || !date) continue
      const key = `${pid}|${date}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({ pid, type, year, date, unit, imported_at: now })
    }

    if (!rows.length) continue

    // Delete old, then insert
    await sb.from('screenings').delete().eq('type', type).eq('year', year)

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500)
      const { error } = await sb.from('screenings').insert(batch)
      if (error) throw new Error(`screenings ${sheetName}: ${error.message}`)
    }

    console.log(`  ✅ ${sheetName}: ${rows.length} รายการ`)
  }

  console.log('\n🎉 Migration เสร็จสมบูรณ์!')
  console.log('เปิดเว็บแล้วรีโหลดเพื่อดูข้อมูลได้เลยครับ')
}

main().catch(err => { console.error('❌ Migration failed:', err); process.exit(1) })
