import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ScreeningDB, ScreeningRow, VillageRow, VillageStat } from '@/types'

// ── Tailwind helper ──────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Date helpers ─────────────────────────────────────────────────
// แปลง "16/02/2567 10:28" → "16/2/2567"  (รองรับ leading zeros และ timestamp)
export function formatThaiDate(raw: string): string {
  try {
    // ตัด whitespace และ tab ออก
    const cleaned = raw.trim().replace(/\t/g, '')
    if (!cleaned) return ''
    // เอาเฉพาะส่วนวันที่ (ก่อน space)
    const dateOnly = cleaned.split(' ')[0]
    // ISO format: YYYY-MM-DD
    const isoMatch = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) return `${+isoMatch[3]}/${+isoMatch[2]}/${isoMatch[1]}`
    // Thai format: DD/MM/YYYY หรือ D/M/YYYY
    const p = dateOnly.split('/')
    if (p.length !== 3) return dateOnly
    const d = +p[0], m = +p[1], y = p[2].trim()
    if (isNaN(d) || isNaN(m) || !y) return dateOnly
    return `${d}/${m}/${y}`
  } catch { return raw.trim() }
}

// แปลง Date object → d/M/YYYY (รองรับ พ.ศ.)
export function formatDob(val: unknown): string {
  if (!val) return ''
  if (val instanceof Date) {
    const y = val.getFullYear()
    const yearDisplay = y < 2400 ? y + 543 : y
    return `${val.getDate()}/${val.getMonth() + 1}/${yearDisplay}`
  }
  return String(val).trim().split(' ')[0]
}

// แปลง Date object หรือ string ที่แสดงผิดกลับมา
export function cleanDate(d: string): string {
  if (!d) return ''
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(d)) return d
  try {
    const dt = new Date(d)
    if (!isNaN(dt.getTime())) return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
  } catch { /* ignore */ }
  return d
}

// ── Addr helper ──────────────────────────────────────────────────
export function formatAddr(val: unknown): string {
  if (!val && val !== 0) return ''
  if (val instanceof Date) return `${val.getDate()}/${val.getMonth() + 1}`
  return String(val).trim()
}

// ── Screening DB helpers ─────────────────────────────────────────
// สร้าง lookup จาก array ของ ScreeningRow
export function buildScreeningDB(rows: ScreeningRow[]): ScreeningDB {
  const db: ScreeningDB = { HBsAg: {}, AntiHCV: {} }
  for (const row of rows) {
    const { pid, type, year, date, unit, name } = row
    if (!db[type][year]) db[type][year] = {}
    if (!db[type][year][pid]) db[type][year][pid] = { dates: [], unit: '', name: '' }
    const entry = db[type][year][pid]
    if (date && !entry.dates.includes(date)) entry.dates.push(date)
    if (unit && !entry.unit) entry.unit = unit
    // เก็บชื่อ: ถ้ายังว่างให้เซต, ถ้ามีแล้วไม่ทับ
    if (name && !entry.name) entry.name = name
  }
  return db
}

export function isScreened(
  db: ScreeningDB,
  pid: string,
  type: 'HBsAg' | 'AntiHCV',
  year: string,
): boolean {
  const t = db[type]
  if (!t) return false
  if (year === 'all') return Object.values(t).some(pids => !!pids[pid])
  return !!(t[year]?.[pid])
}

export function getPidInfo(
  db: ScreeningDB,
  pid: string,
  type: 'HBsAg' | 'AntiHCV',
): { by_year: Record<string, string[]>; unit: string; name: string } {
  const t = db[type] ?? {}
  const result: { by_year: Record<string, string[]>; unit: string; name: string } = {
    by_year: {},
    unit: '',
    name: '',
  }
  for (const [yr, pids] of Object.entries(t)) {
    if (pids[pid]) {
      result.by_year[yr] = pids[pid].dates
      if (!result.unit && pids[pid].unit) result.unit = pids[pid].unit
      if (!result.name && pids[pid].name) result.name = pids[pid].name
    }
  }
  return result
}

// ดึงชื่อของ pid จาก ScreeningDB (ลอง HBsAg ก่อน แล้ว AntiHCV)
export function getScreeningName(db: ScreeningDB, pid: string): string {
  for (const type of ['HBsAg', 'AntiHCV'] as const) {
    for (const byPid of Object.values(db[type])) {
      if (byPid[pid]?.name) return byPid[pid].name
    }
  }
  return ''
}

export function fmtDates(
  byYear: Record<string, string[]>,
  year: string,
): string | null {
  if (year !== 'all') {
    const d = byYear[year]
    return d ? d.map(cleanDate).join(', ') : null
  }
  const all: string[] = []
  for (const ds of Object.values(byYear)) all.push(...ds.map(cleanDate))
  return all.length ? all.join(', ') : null
}

// ── Village stats ────────────────────────────────────────────────
export function computeVillageStat(
  moo: string,
  rows: VillageRow[],
  db: ScreeningDB,
): VillageStat {
  let hb = 0, hcv = 0
  for (const r of rows) {
    if (isScreened(db, r.pid, 'HBsAg', 'all'))   hb++
    if (isScreened(db, r.pid, 'AntiHCV', 'all')) hcv++
  }
  const total = rows.length
  return {
    moo,
    total,
    hbCount:  hb,
    hcvCount: hcv,
    hbPct:    total ? +(hb / total * 100).toFixed(2) : 0,
    hcvPct:   total ? +(hcv / total * 100).toFixed(2) : 0,
  }
}

export function pctClass(p: number): 'high' | 'mid' | 'low' {
  return p >= 70 ? 'high' : p >= 55 ? 'mid' : 'low'
}

// ── CSV parse ────────────────────────────────────────────────────
export function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 2) return []
  const sep = lines[0].includes('\t') ? '\t' : ','
  const headers = splitCSVLine(lines[0], sep).map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], sep)
    if (!cols.length) continue
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = (cols[idx] ?? '').trim().replace(/^"|"$/g, '') })
    rows.push(obj)
  }
  return rows
}

function splitCSVLine(line: string, sep: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === sep && !inQ) { result.push(cur); cur = '' }
    else cur += c
  }
  result.push(cur)
  return result
}

// ── Number formatting ────────────────────────────────────────────
export function fmtNum(n: number): string {
  return n.toLocaleString('th-TH')
}

// ── Sort villages ────────────────────────────────────────────────
export function sortMoos(moos: string[]): string[] {
  return [...moos].sort((a, b) => {
    const na = parseInt(a.replace('ม.', ''))
    const nb = parseInt(b.replace('ม.', ''))
    return na - nb
  })
}