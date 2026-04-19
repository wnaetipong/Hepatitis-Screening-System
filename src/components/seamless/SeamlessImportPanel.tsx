'use client'
import { useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────
export interface SummaryRow {
  zone: string; province: string; hsend: string; hospital_name: string
  smt_ref: string; rep_no: string; rep_date: string
  n_claim: number; b_claim: number; n_comp: number; b_comp: number
  n_notcomp: number; fiscal_year: string; source_file: string
}
export interface SmtRow {
  transfer_date: string; batch_no: string; smt_ref: string
  account_code: string; fund: string; fund_sub: string
  amount: number; delayed: number; deducted: number
  guarantee: number; tax: number; net: number
  pending: number; transferred: number; fiscal_year: string; source_file: string
}

// ── Helpers ────────────────────────────────────────────────────────
const fmtNum  = (n: number) => n.toLocaleString('th-TH')
const fmtBaht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const MONTH_MAP: Record<string, string> = {
  'ม.ค.':'01','ก.พ.':'02','มี.ค.':'03','เม.ย.':'04','พ.ค.':'05','มิ.ย.':'06',
  'ก.ค.':'07','ส.ค.':'08','ก.ย.':'09','ต.ค.':'10','พ.ย.':'11','ธ.ค.':'12',
}
function parseThaiDate(s: string): string {
  if (!s) return ''
  const parts = s.trim().split(/\s+/)
  if (parts.length !== 3) return s
  const [d, m, y] = parts
  return `${y}-${(MONTH_MAP[m] ?? '00')}-${d.padStart(2,'0')}`
}

// SheetJS
declare global { interface Window { XLSX: any } }
let xlsxReady = false
async function loadSheetJS() {
  if (xlsxReady && window.XLSX) return window.XLSX
  return new Promise<any>((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => { xlsxReady = true; res(window.XLSX) }
    s.onerror = () => rej(new Error('โหลด SheetJS ไม่สำเร็จ'))
    document.head.appendChild(s)
  })
}
async function readXlsxRaw(file: File): Promise<(string | number | null)[][]> {
  const XLSX = await loadSheetJS()
  const bstr = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = e => res(e.target?.result as string)
    r.onerror = () => rej(new Error('อ่านไฟล์ไม่สำเร็จ'))
    r.readAsBinaryString(file)
  })
  const wb = XLSX.read(bstr, { type: 'binary', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const cellKeys = Object.keys(ws).filter((k: string) => !k.startsWith('!'))
  if (cellKeys.length > 0) {
    let maxRow = 0, maxColIdx = 0
    for (const key of cellKeys) {
      const m = key.match(/^([A-Z]+)(\d+)$/)
      if (m) {
        const row = parseInt(m[2])
        const colIdx = m[1].split('').reduce((acc: number, c: string) => acc * 26 + c.charCodeAt(0) - 64, 0)
        if (row > maxRow) maxRow = row
        if (colIdx > maxColIdx) maxColIdx = colIdx
      }
    }
    const letter = maxColIdx > 26
      ? String.fromCharCode(64 + Math.floor((maxColIdx-1)/26)) + String.fromCharCode(65 + (maxColIdx-1)%26)
      : String.fromCharCode(64 + maxColIdx)
    ws['!ref'] = `A1:${letter}${maxRow}`
  }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as (string|number|null)[][]
}

function cv(row: any[], i: number): string {
  const v = row[i]; if (v === null || v === undefined || v === '') return ''
  const s = String(v).trim(); return (s === 'nan' || s === 'NaN') ? '' : s
}
function nv(row: any[], i: number): number {
  const v = parseFloat(String(row[i] ?? '')); return isNaN(v) ? 0 : v
}

async function parseSummary(file: File, year: string): Promise<SummaryRow[]> {
  const raw = await readXlsxRaw(file)
  const rows: SummaryRow[] = []
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]
    const col0 = cv(row, 0)
    if (!col0 || ['รวม','เขต','ลำดับ'].includes(col0)) continue
    const repNo = cv(row, 5)
    if (!repNo || !repNo.startsWith('DKTP')) continue
    rows.push({
      zone: col0, province: cv(row,1), hsend: cv(row,2), hospital_name: cv(row,3),
      smt_ref: cv(row,4), rep_no: repNo, rep_date: cv(row,6),
      n_claim: nv(row,7), b_claim: nv(row,8), n_comp: nv(row,9), b_comp: nv(row,10),
      n_notcomp: nv(row,12), fiscal_year: year, source_file: file.name,
    })
  }
  return rows
}

async function parseSmt(file: File, year: string): Promise<SmtRow[]> {
  const raw = await readXlsxRaw(file)
  let dataStart = 5
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if (raw[i].map((v: any) => String(v ?? '')).join('|').includes('วันที่โอน')) {
      dataStart = i + 1; break
    }
  }
  const rows: SmtRow[] = []
  for (let i = dataStart; i < raw.length; i++) {
    const row = raw[i]
    const ref = cv(row, 3)
    if (!ref.toUpperCase().includes('DKTP')) continue
    rows.push({
      transfer_date: parseThaiDate(cv(row,1)), batch_no: cv(row,2), smt_ref: ref,
      account_code: cv(row,4), fund: cv(row,5), fund_sub: cv(row,6),
      amount: nv(row,7), delayed: nv(row,8), deducted: nv(row,9),
      guarantee: nv(row,10), tax: nv(row,11), net: nv(row,12),
      pending: nv(row,13), transferred: nv(row,14),
      fiscal_year: year, source_file: file.name,
    })
  }
  return rows
}

// ── Per-Year Upload Card ──────────────────────────────────────────
function YearCard({
  year, count, summary, onUpload, onDelete, loading, color,
}: {
  year: string; count: number; summary?: string
  onUpload: (f: File[]) => void; onDelete: () => void
  loading: boolean; color: 'purple' | 'teal'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const colors = {
    purple: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700', btnAlt: 'border-purple-200 text-purple-600 hover:bg-purple-50' },
    teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-700',     btn: 'bg-teal-600 hover:bg-teal-700',     btnAlt: 'border-teal-200 text-teal-600 hover:bg-teal-50' },
  }
  const c = colors[color]
  const hasData = count > 0

  return (
    <div className={cn('border-2 rounded-xl p-4 flex flex-col gap-3 transition-all min-h-[140px]',
      hasData ? `${c.border} ${c.bg}` : 'border-dashed border-gray-200 bg-gray-50/40')}>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) onUpload(f) }}/>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-bold text-gray-700">ปีงบ {year}</span>
        {hasData && <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', c.badge)}>{fmtNum(count)}</span>}
      </div>
      {summary ? (
        <div className="text-[11px] text-gray-500 flex-1">{summary}</div>
      ) : (
        <div className="text-[11px] text-gray-400 flex-1">ยังไม่มีข้อมูล</div>
      )}
      <div className="flex gap-1.5 mt-auto">
        <button type="button" disabled={loading}
          onClick={() => inputRef.current?.click()}
          className={cn('flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all text-center',
            loading ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : hasData ? `bg-white border ${c.btnAlt}` : `${c.btn} text-white`)}>
          {loading
            ? <span className="flex items-center justify-center gap-1"><span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin"/>...</span>
            : hasData ? '↺ อัปเดต' : '+ Upload'}
        </button>
        {hasData && (
          <button type="button"
            onClick={onDelete}
            className="px-2.5 py-1.5 text-[11px] text-red-400 border border-red-100 rounded-lg hover:bg-red-50 transition-all">✕</button>
        )}
      </div>
    </div>
  )
}

// ── Add Year Card ──────────────────────────────────────────────────
function AddYearCard({ onClick, color }: { onClick: () => void; color: 'purple' | 'teal' }) {
  const hoverColor = color === 'purple' ? 'hover:border-purple-300 group-hover:text-purple-500' : 'hover:border-teal-300 group-hover:text-teal-500'
  return (
    <div onClick={onClick}
      className={cn('border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[140px] cursor-pointer group transition-all', hoverColor)}>
      <div className="w-8 h-8 rounded-full border-2 border-gray-300 group-hover:border-current flex items-center justify-center transition-all">
        <span className="text-gray-400 text-lg leading-none">+</span>
      </div>
      <div className="text-[11px] text-gray-400">เพิ่มปีใหม่</div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────
interface SeamlessImportPanelProps {
  sumRows: { fiscal_year: string; rep_no: string; b_claim: number; b_comp: number; source_file: string }[]
  smtRows: { fiscal_year: string; transferred: number; smt_ref: string; source_file: string }[]
  onSumImported: (rows: SummaryRow[]) => void
  onSmtImported: (rows: SmtRow[]) => void
  onSumDeleteYear: (year: string) => void
  onSmtDeleteYear: (year: string) => void
  showToast: (msg: string, ok: boolean) => void
}

export function SeamlessImportPanel({
  sumRows, smtRows,
  onSumImported, onSmtImported,
  onSumDeleteYear, onSmtDeleteYear,
  showToast,
}: SeamlessImportPanelProps) {
  const [sumYears, setSumYears] = useState(['2566','2567','2568','2569'])
  const [smtYears, setSmtYears] = useState(['2566','2567','2568','2569'])
  const [loadingSumYear, setLoadingSumYear] = useState<string|null>(null)
  const [loadingSmtYear, setLoadingSmtYear] = useState<string|null>(null)

  // compute unique years from actual data
  const allSumYears = [...new Set([...sumYears, ...sumRows.map(r => r.fiscal_year).filter(Boolean)])].sort()
  const allSmtYears = [...new Set([...smtYears, ...smtRows.map(r => r.fiscal_year).filter(Boolean)])].sort()

  const handleSumUpload = useCallback(async (files: File[], year: string) => {
    setLoadingSumYear(year)
    try {
      for (const f of files) {
        const parsed = await parseSummary(f, year)
        if (!parsed.length) { showToast(`ไม่พบข้อมูล DKTP ในไฟล์ ${f.name}`, false); continue }
        const j = await fetch('/api/rep-summary', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: parsed }),
        }).then(r => r.json())
        if (j.ok) { onSumImported(parsed); showToast(`✓ ปี ${year}: ${fmtNum(parsed.length)} REP batch`, true) }
        else showToast(j.error, false)
      }
    } catch (e) { showToast(String(e), false) }
    setLoadingSumYear(null)
  }, [onSumImported, showToast])

  const handleSmtUpload = useCallback(async (files: File[], year: string) => {
    setLoadingSmtYear(year)
    try {
      for (const f of files) {
        const parsed = await parseSmt(f, year)
        if (!parsed.length) { showToast(`ไม่พบรายการ DKTP ในไฟล์ ${f.name}`, false); continue }
        const BATCH = 200; let total = 0
        for (let i = 0; i < parsed.length; i += BATCH) {
          const chunk = parsed.slice(i, i + BATCH)
          const j = await fetch('/api/smt', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: chunk }),
          }).then(r => r.json())
          if (j.ok) { total += j.imported ?? 0; onSmtImported(chunk) }
          else { showToast(j.error, false); break }
        }
        showToast(`✓ ปี ${year}: ${fmtNum(total)} รายการ DKTP`, total > 0)
      }
    } catch (e) { showToast(String(e), false) }
    setLoadingSmtYear(null)
  }, [onSmtImported, showToast])

  const handleDeleteSum = useCallback(async (year: string) => {
    if (!window.confirm(`ล้างข้อมูล REP Summary ปีงบ ${year}?`)) return
    const j = await fetch(`/api/rep-summary?year=${year}`, { method: 'DELETE' }).then(r => r.json())
    if (j.ok) { onSumDeleteYear(year); showToast(`✓ ล้างปี ${year} เรียบร้อย`, true) }
    else showToast(j.error, false)
  }, [onSumDeleteYear, showToast])

  const handleDeleteSmt = useCallback(async (year: string) => {
    if (!window.confirm(`ล้างข้อมูล SMT ปีงบ ${year}?`)) return
    const j = await fetch(`/api/smt?year=${year}`, { method: 'DELETE' }).then(r => r.json())
    if (j.ok) { onSmtDeleteYear(year); showToast(`✓ ล้างปี ${year} เรียบร้อย`, true) }
    else showToast(j.error, false)
  }, [onSmtDeleteYear, showToast])

  return (
    <div className="space-y-7">
      {/* REP Summary */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-purple-500"/>
          <h3 className="font-bold text-gray-900 text-[13.5px]">REP Summary</h3>
          <span className="text-[11px] text-gray-400">Seamless DMIS → REP → รายงาน REP แบบ Summary</span>
          <span className="ml-auto text-[11px] text-gray-400">{fmtNum(sumRows.length)} batch</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {allSumYears.map(yr => {
            const yrRows = sumRows.filter(r => r.fiscal_year === yr)
            const summary = yrRows.length > 0
              ? `${fmtNum(yrRows.length)} batch · ขอเบิก ฿${fmtBaht(yrRows.reduce((a,b)=>a+b.b_claim,0))} · ชดเชย ฿${fmtBaht(yrRows.reduce((a,b)=>a+b.b_comp,0))}`
              : undefined
            return (
              <YearCard key={yr} year={yr} count={yrRows.length} summary={summary}
                onUpload={f => handleSumUpload(f, yr)}
                onDelete={() => handleDeleteSum(yr)}
                loading={loadingSumYear === yr} color="purple"/>
            )
          })}
          <AddYearCard color="purple" onClick={() => {
            const last = allSumYears[allSumYears.length-1] ?? '2569'
            setSumYears(p => [...new Set([...p, String(parseInt(last)+1)]).values()].sort())
          }}/>
        </div>
      </div>

      {/* SMT */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-teal-500"/>
          <h3 className="font-bold text-gray-900 text-[13.5px]">Smart Money Transfer</h3>
          <span className="text-[11px] text-gray-400">ระบบ SMT สปสช. · กรองเฉพาะรายการ DKTP อัตโนมัติ</span>
          {smtRows.length > 0 && <span className="ml-auto text-[11px] text-emerald-600 font-semibold">฿{fmtBaht(smtRows.reduce((a,b)=>a+b.transferred,0))}</span>}
        </div>
        <div className="grid grid-cols-4 gap-3">
          {allSmtYears.map(yr => {
            const yrRows = smtRows.filter(r => r.fiscal_year === yr)
            const summary = yrRows.length > 0
              ? `${fmtNum(new Set(yrRows.map(r => r.smt_ref)).size)} งวด DKTP · โอน ฿${fmtBaht(yrRows.reduce((a,b)=>a+b.transferred,0))}`
              : undefined
            return (
              <YearCard key={yr} year={yr} count={yrRows.length} summary={summary}
                onUpload={f => handleSmtUpload(f, yr)}
                onDelete={() => handleDeleteSmt(yr)}
                loading={loadingSmtYear === yr} color="teal"/>
            )
          })}
          <AddYearCard color="teal" onClick={() => {
            const last = allSmtYears[allSmtYears.length-1] ?? '2569'
            setSmtYears(p => [...new Set([...p, String(parseInt(last)+1)]).values()].sort())
          }}/>
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          ปี 2566: ไม่มีรายการ DKTP (โปรแกรม KTB เริ่มใช้งานปี 2567)
        </p>
      </div>
    </div>
  )
}