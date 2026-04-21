'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { ScreeningDB } from '@/types'

// ── Types ──────────────────────────────────────────────────────────
interface IndividualRow {
  id?: number; seq: string; rep_no: string; trans_id: string; hn: string; pid: string
  name: string; rights: string; hmain: string; send_date: string; service_date: string
  item_seq: string; service_name: string; qty: number; price: number; ceiling: number
  total_claim: number; ps_code: string; ps_pct: number; compensated: number
  not_comp: number; extra: number; recall: number; status: string; note: string
  note_other: string; hsend: string; source_file: string; imported_at?: string
}
interface SummaryRow {
  id?: number; zone: string; province: string; hsend: string; hospital_name: string
  smt_ref: string; rep_no: string; rep_date: string; n_claim: number; b_claim: number
  n_comp: number; b_comp: number; n_notcomp: number; fiscal_year: string; source_file: string
}
interface SmtRow {
  id?: number; transfer_date: string; batch_no: string; smt_ref: string
  account_code: string; fund: string; fund_sub: string; amount: number
  delayed: number; deducted: number; guarantee: number; tax: number
  net: number; pending: number; transferred: number; fiscal_year: string; source_file: string
}

// ── SheetJS ────────────────────────────────────────────────────────
declare global { interface Window { XLSX: any } }
let xlsxReady = false
async function loadSheetJS() {
  if (xlsxReady && window.XLSX) return window.XLSX
  return new Promise<any>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => { xlsxReady = true; resolve(window.XLSX) }
    s.onerror = () => reject(new Error('โหลด SheetJS ไม่สำเร็จ'))
    document.head.appendChild(s)
  })
}

function colIdxToLetter(idx1: number): string {
  return idx1 > 26
    ? String.fromCharCode(64 + Math.floor((idx1 - 1) / 26)) + String.fromCharCode(65 + (idx1 - 1) % 26)
    : String.fromCharCode(64 + idx1)
}

async function readXlsxRaw(file: File): Promise<(string | number | null)[][]> {
  const XLSX = await loadSheetJS()
  const bstr = await new Promise<string>((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target?.result as string)
    r.onerror = () => rej(new Error('อ่านไฟล์ไม่สำเร็จ')); r.readAsBinaryString(file)
  })
  const wb = XLSX.read(bstr, { type: 'binary', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const cellKeys = Object.keys(ws).filter(k => !k.startsWith('!'))
  if (cellKeys.length > 0) {
    let maxRow = 0, maxColIdx = 0
    for (const key of cellKeys) {
      const m = key.match(/^([A-Z]+)(\d+)$/)
      if (m) {
        const row = parseInt(m[2])
        const colIdx = m[1].split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0)
        if (row > maxRow) maxRow = row
        if (colIdx > maxColIdx) maxColIdx = colIdx
      }
    }
    ws['!ref'] = `A1:${colIdxToLetter(maxColIdx)}${maxRow}`
  }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as (string | number | null)[][]
}

// ── Parsers ────────────────────────────────────────────────────────
function cv(row: any[], i: number): string {
  const v = row[i]; if (v === null || v === undefined || v === '') return ''
  return String(v).trim()
}
function nv(row: any[], i: number): number {
  const v = parseFloat(String(row[i] ?? '')); return isNaN(v) ? 0 : v
}
function excelSerialToThaiDate(serial: number): string {
  const ms = (serial - 25569) * 86400 * 1000
  const date = new Date(ms)
  const d = date.getUTCDate().toString().padStart(2, '0')
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const y = (date.getUTCFullYear() + 543).toString()
  return `${d}/${m}/${y}`
}
function cdv(row: any[], i: number): string {
  const v = row[i]
  if (typeof v === 'number' && v > 1000) return excelSerialToThaiDate(v)
  if (v === null || v === undefined || v === '') return ''
  return String(v).trim()
}

async function parseIndividual(file: File): Promise<{ rows: IndividualRow[]; error?: string }> {
  try {
    const raw = await readXlsxRaw(file)
    let dataStart = 10
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      if (raw[i].map(v => String(v ?? '')).join('|').includes('ลำดับที่') && raw[i].map(v => String(v ?? '')).join('|').includes('REP')) {
        dataStart = i + 3; break
      }
    }
    const rows: IndividualRow[] = []
    for (let i = dataStart; i < raw.length; i++) {
      const row = raw[i]; const repNo = cv(row, 1), transId = cv(row, 2)
      if (!repNo || !transId) continue
      rows.push({ seq: cv(row,0), rep_no: repNo, trans_id: transId, hn: cv(row,3), pid: cv(row,5), name: cv(row,6), rights: cv(row,7), hmain: cv(row,8), send_date: cdv(row,9), service_date: cdv(row,10), item_seq: cv(row,11), service_name: cv(row,12), qty: nv(row,13), price: nv(row,14), ceiling: nv(row,15), total_claim: nv(row,16), ps_code: cv(row,17), ps_pct: nv(row,18), compensated: nv(row,19), not_comp: nv(row,20), extra: nv(row,21), recall: nv(row,22), status: cv(row,23), note: cv(row,24), note_other: cv(row,25), hsend: cv(row,26), source_file: file.name })
    }
    return { rows }
  } catch (e) { return { rows: [], error: String(e) } }
}

async function parseSummary(file: File): Promise<{ rows: SummaryRow[]; error?: string }> {
  try {
    const raw = await readXlsxRaw(file)
    const rows: SummaryRow[] = []
    for (let i = 0; i < raw.length; i++) {
      const row = raw[i]
      const col0 = cv(row, 0)
      if (!col0) continue
      if (['รวม','เขต','ลำดับ'].includes(col0)) continue
      const repNo = cv(row, 5)
      if (!repNo || !repNo.startsWith('DKTP')) continue
      const smtRaw = cv(row, 4)
      const smtRef = (smtRaw === 'nan' || smtRaw === 'NaN') ? '' : smtRaw
      const yyStr = repNo.substring(4, 6)
      const fiscalYear = yyStr ? `25${yyStr}` : ''
      rows.push({
        zone: col0, province: cv(row,1), hsend: cv(row,3), hospital_name: cv(row,4),
        smt_ref: smtRef, rep_no: repNo, rep_date: cv(row,6),
        n_claim: nv(row,7), b_claim: nv(row,8), n_comp: nv(row,9), b_comp: nv(row,10),
        n_notcomp: nv(row,12), fiscal_year: fiscalYear, source_file: file.name,
      })
    }
    return { rows }
  } catch (e) { return { rows: [], error: String(e) } }
}

const MONTH_MAP: Record<string, string> = {
  'ม.ค.':'01','ก.พ.':'02','มี.ค.':'03','เม.ย.':'04','พ.ค.':'05','มิ.ย.':'06',
  'ก.ค.':'07','ส.ค.':'08','ก.ย.':'09','ต.ค.':'10','พ.ย.':'11','ธ.ค.':'12',
}
function parseThaiDate(s: string): string {
  if (!s) return ''
  const parts = s.trim().split(/\s+/)
  if (parts.length !== 3) return s
  const [d, m, y] = parts
  const mm = MONTH_MAP[m] ?? '00'
  return `${y}-${mm}-${d.padStart(2,'0')}`
}

async function parseSmt(file: File): Promise<{ rows: SmtRow[]; error?: string }> {
  try {
    const raw = await readXlsxRaw(file)
    let dataStart = 6
    for (let i = 0; i < Math.min(15, raw.length); i++) {
      if (raw[i].map(v => String(v ?? '')).join('|').includes('วันที่โอน')) {
        dataStart = i + 1; break
      }
    }
    let fiscalYear = ''
    for (let i = 0; i < Math.min(8, raw.length); i++) {
      const line = raw[i].map(v => String(v ?? '')).join(' ')
      const m = line.match(/01\/10\/25(\d{2})/)
      if (m) { fiscalYear = `25${m[1]}`; break }
    }
    const rows: SmtRow[] = []
    for (let i = dataStart; i < raw.length; i++) {
      const row = raw[i]
      if (!cv(row, 0) && !cv(row, 1)) continue
      const ref = cv(row, 3)
      if (!ref.toUpperCase().includes('DKTP')) continue
      const dateRaw = cv(row, 1)
      rows.push({
        transfer_date: parseThaiDate(dateRaw),
        batch_no: cv(row, 2), smt_ref: ref,
        account_code: cv(row, 4), fund: cv(row, 5), fund_sub: cv(row, 6),
        amount: nv(row, 7), delayed: nv(row, 8), deducted: nv(row, 9),
        guarantee: nv(row, 10), tax: nv(row, 11), net: nv(row, 12),
        pending: nv(row, 13), transferred: nv(row, 14),
        fiscal_year: fiscalYear, source_file: file.name,
      })
    }
    return { rows }
  } catch (e) { return { rows: [], error: String(e) } }
}

// ── Helpers ────────────────────────────────────────────────────────
const isHepB = (s: string) => s.includes('ไวรัสตับอักเสบ บี') || s.includes('HBsAg')
const isHepC = (s: string) => s.includes('ไวรัสตับอักเสบ ซี') || s.includes('Anti-HCV')
const fmtBaht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtNum  = (n: number) => n.toLocaleString('th-TH')

function parseDateParts(d: string): { year: string; month: string } | null {
  if (!d) return null
  const sp = d.split('/')
  if (sp.length === 3) return { month: sp[1].padStart(2,'0'), year: sp[2] }
  const dp = d.split('-')
  if (dp.length === 3 && dp[0].length === 4) return { month: dp[1].padStart(2,'0'), year: dp[0] }
  const serial = parseInt(d)
  if (!isNaN(serial) && serial > 1000) {
    const date = new Date((serial - 25569) * 86400 * 1000)
    return { month: (date.getUTCMonth()+1).toString().padStart(2,'0'), year: (date.getUTCFullYear()+543).toString() }
  }
  return null
}
function isoToThai(s: string): string {
  if (!s) return '—'
  const p = s.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s
}
function getReasonLabel(note: string, noteOther: string): string {
  const raw = note || ''
  if (raw.startsWith('C305')) return 'ไม่พบการแสดงตนยืนยันสิทธิ (C305)'
  if (raw.startsWith('KT099')) return 'จ่ายชดเชยจากกองทุนประกันสังคม (KT099)'
  if (noteOther?.includes('เรียกเงินคืน')) return 'เรียกคืนเนื่องจากจ่ายซ้ำซ้อน'
  const cleaned = raw.replace(/^[A-Z0-9]+##/, '').trim()
  return cleaned || noteOther?.trim() || 'ไม่ระบุ'
}

const RIGHTS_LABEL: Record<string, string> = { UCS:'บัตรทอง', WEL:'สวัสดิการข้าราชการ', SSS:'ประกันสังคม', OFC:'ต่างด้าว', LGO:'อปท.' }
const MONTH_TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// ── HSEND → ชื่อย่อสำหรับแสดง UI ─────────────────────────────────
const HSEND_UNIT_NAME: Record<string, string> = {
  '07624': 'รพ.สต.บ้านหนองยาง',
  '07625': 'รพ.สต.หนองปลาไหล',
  '07626': 'รพ.สต.บ้านวังทับไทร',
  '07627': 'รพ.สต.บ้านคลองสะแก-ป่าหวาย',
  '07628': 'รพ.สต.บ้านยางสามต้น',
  '07629': 'รพ.สต.หนองพระ',
  '07630': 'รพ.สต.หนองปล้อง',
  '11258': 'รพ.วังทรายพูน',
}

// ── HSEND → unit name mapping ──────────────────────────────────────
const HSEND_UNIT_MAP: Record<string, string[]> = {
  '07624': [
    'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองยาง',
    'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองยาง วังทรายพูน',
  ],
  '07625': ['โรงพยาบาลส่งเสริมสุขภาพตำบลหนองปลาไหล'],
  '07626': ['โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านวังทับไทร'],
  '07627': [
    'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านคลองสะแก-ป่าหวาย',
    'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านคลองสะแก-ปลาหวาย',
  ],
  '07628': ['โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านยางสามต้น'],
  '07629': ['โรงพยาบาลส่งเสริมสุขภาพตำบลหนองพระ'],
  '07630': ['โรงพยาบาลส่งเสริมสุขภาพตำบลหนองปล้อง'],
  '11258': ['โรงพยาบาลวังทรายพูน'],
}

// ── Sub-components ─────────────────────────────────────────────────
function KpiCard({ icon, label, val, sub, sub2, bar, barColor }: { icon:string; label:string; val:string; sub:string; sub2?:string; bar:number; barColor:string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{background:barColor}}/>
      <div className="text-2xl mb-3">{icon}</div>
      <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">{label}</div>
      <div className="text-[22px] font-black text-gray-900 mb-0.5">{val}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
      {sub2 && <div className="text-[12px] font-bold mt-1" style={{color:barColor}}>{sub2}</div>}
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(bar*100,100)}%`,background:barColor}}/>
      </div>
    </div>
  )
}

function DonutChart({ slices, size=120 }: { slices: { label: string; value: number; color: string }[]; size?: number }) {
  const [hov, setHov] = useState<number|null>(null)
  const total = slices.reduce((a,b) => a + b.value, 0)
  if (!total) return <div className="flex flex-col items-center justify-center py-8 text-gray-300 text-xs gap-2"><div className="w-16 h-16 rounded-full border-4 border-dashed border-gray-100 flex items-center justify-center text-[20px] opacity-40">?</div>ไม่มีข้อมูล</div>
  const R = size*0.42, cx = size/2, cy = size/2, r = size*0.22
  let angle = -Math.PI / 2
  const paths = slices.map((s,i) => {
    const pct = s.value / total; const startA = angle; angle += pct * Math.PI * 2
    const x1 = cx + R * Math.cos(startA); const y1 = cy + R * Math.sin(startA)
    const x2 = cx + R * Math.cos(angle); const y2 = cy + R * Math.sin(angle)
    const midA = startA + pct * Math.PI
    const offset = hov === i ? 6 : 0
    const ox = offset * Math.cos(midA), oy = offset * Math.sin(midA)
    return { ...s, d: `M${cx+ox},${cy+oy} L${x1+ox},${y1+oy} A${R},${R} 0 ${pct>0.5?1:0} 1 ${x2+ox},${y2+oy} Z`, pct, i }
  })
  const hovSlice = hov !== null ? paths[hov] : null
  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{width:size,height:size}}>
        <svg viewBox={`0 0 ${size+16} ${size+16}`} style={{width:size+16,height:size+16,overflow:'visible'}}>
          <g transform="translate(8,8)">
            {paths.map((p,i) => (
              <path key={i} d={p.d} fill={p.color}
                opacity={hov===null?0.9:hov===i?1:0.45}
                style={{transition:'opacity .15s, transform .15s', cursor:'pointer'}}
                onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}/>
            ))}
            <circle cx={cx} cy={cy} r={r} fill="white"/>
            {hovSlice?(
              <>
                <text x={cx} y={cy-6} textAnchor="middle" fontSize={size*0.085} fontWeight="700" fill={hovSlice.color}>{(hovSlice.pct*100).toFixed(1)}%</text>
                <text x={cx} y={cy+8} textAnchor="middle" fontSize={size*0.075} fill="#6b7280">{fmtNum(hovSlice.value)}</text>
              </>
            ):(
              <>
                <text x={cx} y={cy-4} textAnchor="middle" fontSize={size*0.09} fontWeight="700" fill="#1f2937">{fmtNum(total)}</text>
                <text x={cx} y={cy+10} textAnchor="middle" fontSize={size*0.07} fill="#9ca3af">รายการ</text>
              </>
            )}
          </g>
        </svg>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {paths.map((p,i) => (
          <div key={i} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-all',hov===i?'bg-gray-50':'')}
            onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-transform" style={{background:p.color, transform:hov===i?'scale(1.3)':'scale(1)'}}/>
            <span className="text-[11.5px] text-gray-600 truncate flex-1">{p.label}</span>
            <span className="text-[11.5px] font-bold flex-shrink-0" style={{color:hov===i?p.color:'#374151'}}>{(p.pct*100).toFixed(1)}%</span>
            <span className="text-[10.5px] text-gray-400 flex-shrink-0 min-w-[40px] text-right">{fmtNum(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthlyChart({ data, hasSmt=false }: { data: { label:string; b:number; c:number; comp:number; notComp:number; pending:number; amount:number }[]; hasSmt?: boolean }) {
  const [hov, setHov] = useState<number|null>(null)
  if (!data.length) return <div className="flex items-center justify-center h-52 text-gray-300 text-sm">ไม่มีข้อมูล</div>
  const W=1000, H=230, PAD={t:36,b:56,l:52,r:72}
  const chartW=W-PAD.l-PAD.r, chartH=H-PAD.t-PAD.b
  const maxSvc=Math.max(...data.map(d=>d.b+d.c),1)
  const magSvc=Math.pow(10,Math.floor(Math.log10(maxSvc)))
  const niceL=Math.ceil(maxSvc/magSvc)*magSvc
  const maxAmt=Math.max(...data.map(d=>d.amount),1)
  const magAmt=Math.pow(10,Math.floor(Math.log10(maxAmt)))
  const niceR=Math.ceil(maxAmt/magAmt)*magAmt
  const n=data.length, slotW=chartW/n, bw=Math.max(7,Math.min(18,slotW/2.6))
  const linePoints=data.map((d,i)=>`${(PAD.l+slotW*i+slotW/2).toFixed(1)},${(PAD.t+chartH*(1-d.amount/niceR)).toFixed(1)}`).join(' ')
  const areaPoints=[(PAD.l+slotW/2).toFixed(1)+','+(PAD.t+chartH).toFixed(1),...data.map((d,i)=>`${(PAD.l+slotW*i+slotW/2).toFixed(1)},${(PAD.t+chartH*(1-d.amount/niceR)).toFixed(1)}`),(PAD.l+slotW*(n-1)+slotW/2).toFixed(1)+','+(PAD.t+chartH).toFixed(1)].join(' ')
  const fmtK=(v:number)=>v>=1000?`${(v/1000).toFixed(v%1000===0?0:1)}k`:String(v)
  return (
    <div className="w-full min-w-0" onMouseLeave={()=>setHov(null)} style={{pointerEvents:'all'}}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" preserveAspectRatio="xMidYMid meet" style={{height:'auto',overflow:'visible',display:'block',pointerEvents:'all'}}>
        <defs>
          <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#1e40af"/></linearGradient>
          <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#0891b2"/></linearGradient>
          <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.18"/><stop offset="100%" stopColor="#10b981" stopOpacity="0.01"/></linearGradient>
          <filter id="ds"><feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.1"/></filter>
          <clipPath id="cc"><rect x={PAD.l} y={PAD.t} width={chartW} height={chartH}/></clipPath>
        </defs>
        <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH} fill="#f9fafb" rx="6"/>
        {Array.from({length:5},(_,i)=>{const pct=i/4,y=PAD.t+chartH*(1-pct);return(<g key={i}><line x1={PAD.l} y1={y} x2={PAD.l+chartW} y2={y} stroke={i===0?'#d1d5db':'#e5e7eb'} strokeWidth={i===0?1.5:1} strokeDasharray={i>0?'4,3':undefined}/><text x={PAD.l-8} y={y+4} textAnchor="end" fontSize="10" fill="#9ca3af">{fmtK(Math.round(niceL*pct))}</text>{hasSmt&&<text x={PAD.l+chartW+8} y={y+4} textAnchor="start" fontSize="10" fill="#6ee7b7">{fmtK(Math.round(niceR*pct))}</text>}</g>)})}
        {data.map((d,i)=>{if(i===0)return null;const pY=data[i-1].label.split('/')[0],tY=d.label.split('/')[0];if(pY===tY)return null;const x=PAD.l+slotW*i;return(<g key={`yr-${i}`}><line x1={x} y1={PAD.t} x2={x} y2={PAD.t+chartH} stroke="#9ca3af" strokeWidth="1" strokeDasharray="5,3"/><rect x={x+3} y={PAD.t+2} width={38} height={14} rx="3" fill="#f3f4f6"/><text x={x+22} y={PAD.t+13} textAnchor="middle" fontSize="9.5" fill="#6b7280" fontWeight="600">ปี {tY}</text></g>)})}
        <g clipPath="url(#cc)">{data.map((d,i)=>{const cx=PAD.l+slotW*i+slotW/2,hB=Math.max(0,(d.b/niceL)*chartH),hC=Math.max(0,(d.c/niceL)*chartH),isH=hov===i;return(<g key={d.label} opacity={hov!==null&&!isH?0.35:1} style={{transition:'opacity .15s'}} onMouseEnter={()=>setHov(i)}>{isH&&<rect x={PAD.l+slotW*i} y={PAD.t} width={slotW} height={chartH} fill="#eff6ff" opacity="0.7"/>}<rect x={cx-bw-1.5} y={PAD.t+chartH-hB} width={bw} height={hB} fill="url(#gb)" rx="3" filter="url(#ds)"/><rect x={cx+1.5} y={PAD.t+chartH-hC} width={bw} height={hC} fill="url(#gc)" rx="3" filter="url(#ds)"/></g>)})}</g>
        {hasSmt&&<><polygon points={areaPoints} fill="url(#ga)" clipPath="url(#cc)"/>
        <polyline points={linePoints} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" clipPath="url(#cc)"/>
        {data.map((d,i)=>{const x=PAD.l+slotW*i+slotW/2,y=PAD.t+chartH*(1-d.amount/niceR),isH=hov===i;return(<circle key={i} cx={x} cy={y} r={isH?6:d.amount>0?3.5:0} fill={isH?'#059669':'#fff'} stroke="#10b981" strokeWidth="2" style={{transition:'r .1s'}} onMouseEnter={()=>setHov(i)}/>)})}</>}
        {data.map((d,i)=>{const x=PAD.l+slotW*i+slotW/2,mm=parseInt(d.label.split('/')[1]),yy=d.label.split('/')[0].slice(2),isH=hov===i;return(<g key={`lbl-${i}`}><text x={x} y={PAD.t+chartH+16} textAnchor="middle" fontSize="10.5" fill={isH?'#2563eb':'#6b7280'} fontWeight={isH?'700':'400'}>{MONTH_TH[mm]}</text><text x={x} y={PAD.t+chartH+29} textAnchor="middle" fontSize="9" fill="#c9d1d9">{yy}</text></g>)})}
        {data.map((_d,i)=>(
          <rect key={`htgt-${i}`} x={PAD.l+slotW*i} y={PAD.t} width={slotW} height={chartH+48}
            fill="transparent" stroke="none"
            onMouseEnter={()=>setHov(i)}/>
        ))}
        {data.length>0&&<g><rect x={PAD.l+2} y={PAD.t+2} width={38} height={14} rx="3" fill="#f3f4f6"/><text x={PAD.l+21} y={PAD.t+13} textAnchor="middle" fontSize="9.5" fill="#6b7280" fontWeight="600">ปี {data[0].label.split('/')[0]}</text></g>}
        {hov!==null&&(()=>{const d=data[hov],cx=PAD.l+slotW*hov+slotW/2,tw=168,th=134,tx=Math.max(PAD.l+4,Math.min(cx-tw/2,W-tw-4)),_tyAbove=PAD.t-th-8,ty=_tyAbove>=PAD.t?_tyAbove:PAD.t+8,mm=parseInt(d.label.split('/')[1]);return(<g><rect x={tx} y={ty} width={tw} height={th} rx="10" fill="white" stroke="#e5e7eb" strokeWidth="1.5" filter="url(#ds)"/><rect x={tx} y={ty} width={tw} height={26} rx="10" fill="#1e40af"/><rect x={tx} y={ty+16} width={tw} height={10} fill="#1e40af"/><text x={tx+tw/2} y={ty+17} textAnchor="middle" fontSize="11" fontWeight="700" fill="white">{MONTH_TH[mm]} {d.label.split('/')[0]}</text><rect x={tx+10} y={ty+33} width="8" height="8" fill="url(#gb)" rx="1.5"/><text x={tx+22} y={ty+41} fontSize="9.5" fill="#6b7280">บี (คัดกรอง): <tspan fontWeight="700" fill="#1d4ed8">{d.b.toLocaleString()}</tspan></text><rect x={tx+10} y={ty+48} width="8" height="8" fill="url(#gc)" rx="1.5"/><text x={tx+22} y={ty+56} fontSize="9.5" fill="#6b7280">ซี (คัดกรอง): <tspan fontWeight="700" fill="#0891b2">{d.c.toLocaleString()}</tspan></text><line x1={tx+10} y1={ty+63} x2={tx+tw-10} y2={ty+63} stroke="#f3f4f6" strokeWidth="1"/><text x={tx+10} y={ty+75} fontSize="9.5" fill="#6b7280">✓ ชดเชย: <tspan fontWeight="700" fill="#059669">{d.comp.toLocaleString()}</tspan></text><text x={tx+10} y={ty+89} fontSize="9.5" fill="#6b7280">✕ ไม่ชดเชย: <tspan fontWeight="700" fill="#ef4444">{d.notComp.toLocaleString()}</tspan></text><text x={tx+10} y={ty+103} fontSize="9.5" fill="#6b7280">⏳ รอประมวลผล: <tspan fontWeight="700" fill="#f59e0b">{d.pending.toLocaleString()}</tspan></text><line x1={tx+10} y1={ty+110} x2={tx+tw-10} y2={ty+110} stroke="#f3f4f6" strokeWidth="1"/>{d.amount>0&&<text x={tx+10} y={ty+124} fontSize="9" fill="#059669" fontWeight="600">฿{d.amount.toLocaleString()} (ชดเชยรวม)</text>}</g>)})()}
        <g transform={`translate(${PAD.l},8)`}><rect x="0" y="1" width="10" height="10" fill="url(#gb)" rx="2"/><text x="14" y="10" fontSize="10" fill="#4b5563">ตับอักเสบ บี (คัดกรอง)</text><rect x="130" y="1" width="10" height="10" fill="url(#gc)" rx="2"/><text x="144" y="10" fontSize="10" fill="#4b5563">ตับอักเสบ ซี (คัดกรอง)</text>{hasSmt&&<><line x1="270" y1="6" x2="284" y2="6" stroke="#10b981" strokeWidth="2.5"/><circle cx="277" cy="6" r="3" fill="white" stroke="#10b981" strokeWidth="2"/><text x="288" y="10" fontSize="10" fill="#4b5563">ยอดชดเชย (฿)</text></>}</g>
      </svg>
    </div>
  )
}

function CompareBarChart({ items }: {
  items: { label: string; total: number; comp: number; unique: number; color: string }[]
}) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => {
        const pct = item.total > 0 ? (item.comp / item.total * 100) : 0
        const notComp = item.total - item.comp
        return (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-gray-800">{item.label}</span>
              <span className="text-[11px] text-gray-400">{fmtNum(item.unique)} คน · {fmtNum(item.total)} รายการ</span>
            </div>
            <div className="h-7 rounded-lg overflow-hidden flex bg-gray-100">
              <div className="h-full flex items-center justify-end pr-2 transition-all duration-700 min-w-0"
                style={{width:`${pct}%`, background:item.color}}>
                {pct > 25 && <span className="text-[10.5px] font-bold text-white whitespace-nowrap">{fmtNum(item.comp)} ชดเชย</span>}
              </div>
              {notComp > 0 && (
                <div className="h-full flex items-center justify-start pl-2 transition-all duration-700 min-w-0"
                  style={{width:`${100-pct}%`, background:'#fee2e2'}}>
                  {100-pct > 12 && <span className="text-[10.5px] font-bold text-red-500 whitespace-nowrap">{fmtNum(notComp)}</span>}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:item.color}}/><span className="text-gray-500">ชดเชย {pct.toFixed(1)}%</span></span>
                {notComp > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-200"/><span className="text-gray-400">ไม่ชดเชย {(100-pct).toFixed(1)}%</span></span>}
              </div>
              <span className="font-bold" style={{color:item.color}}>{pct.toFixed(1)}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Chip({ label, onRemove, color }: { label:string; onRemove:()=>void; color:'blue'|'purple'|'green'|'amber' }) {
  const cls = { blue:'bg-blue-100 text-blue-700 border-blue-200', purple:'bg-purple-100 text-purple-700 border-purple-200', green:'bg-green-100 text-green-700 border-green-200', amber:'bg-amber-100 text-amber-700 border-amber-200' }
  return <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border',cls[color])}>{label}<button type="button" onClick={onRemove} className="w-3.5 h-3.5 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-[9px] ml-0.5 transition-all">✕</button></span>
}

function StatChip({ dot, label, val, unit }: { dot:string; label:string; val:string; unit:string }) {
  return <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:dot}}/><span className="text-gray-500">{label}</span><span className="font-bold text-gray-800">{val}</span>{unit&&<span className="text-gray-400">{unit}</span>}</div>
}

function SummaryCard({ title, rows, color, bgColor, totalOverride, compOverride, notCompOverride, pendingOverride, totalCompOverride }: {
  title:string; rows:IndividualRow[]; color:string; bgColor:string
  totalOverride?:number; compOverride?:number; notCompOverride?:number; pendingOverride?:number; totalCompOverride?:number
}) {
  const total      = totalOverride    ?? rows.length
  const compCount  = compOverride     ?? rows.filter(r=>r.status==='ชดเชย').length
  const notCompCount = notCompOverride ?? rows.filter(r=>r.status==='ไม่ชดเชย').length
  const pendingCount = pendingOverride ?? 0
  const pct = total ? (compCount/total*100) : 0
  const totalComp = totalCompOverride ?? rows.filter(r=>r.status==='ชดเชย').reduce((a,b)=>a+b.compensated,0)
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4"><div className="w-2 h-2 rounded-full" style={{background:color}}/><div className="font-bold text-gray-900 text-[13px]">{title}</div></div>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="text-center p-2.5 rounded-xl" style={{background:bgColor}}><div className="text-[16px] font-black" style={{color}}>{fmtNum(total)}</div><div className="text-[9px] text-gray-500">ทั้งหมด</div></div>
        <div className="text-center p-2.5 rounded-xl bg-emerald-50"><div className="text-[16px] font-black text-emerald-600">{fmtNum(compCount)}</div><div className="text-[9px] text-gray-500">ชดเชยแล้ว</div></div>
        <div className="text-center p-2.5 rounded-xl bg-red-50"><div className="text-[16px] font-black text-red-500">{fmtNum(notCompCount)}</div><div className="text-[9px] text-gray-500">ไม่ชดเชย</div></div>
        <div className="text-center p-2.5 rounded-xl bg-gray-50"><div className="text-[16px] font-black text-gray-400">{fmtNum(pendingCount)}</div><div className="text-[9px] text-gray-400">ยังไม่มีข้อมูล</div></div>
      </div>
      <div className="mb-3"><div className="flex justify-between text-[11.5px] mb-1"><span className="text-gray-500">อัตราชดเชย</span><span className="font-bold" style={{color}}>{pct.toFixed(1)}%</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/></div></div>
      <div className="text-[12px] font-bold" style={{color}}>ยอดชดเชยรวม: ฿{fmtBaht(totalComp)}</div>
    </div>
  )
}

function UploadZone({ label, hint, accept, onFiles, loading, progress }: { label:string; hint:string; accept:string; onFiles:(f:File[])=>void; loading:boolean; progress:string }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className={cn('border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3 transition-all', drag?'border-blue-400 bg-blue-50':'border-gray-200 bg-gray-50/40 hover:border-blue-300')}>
      <input ref={ref} type="file" accept={accept} multiple className="hidden" onChange={e=>{const f=Array.from(e.target.files??[]);e.target.value='';if(f.length)onFiles(f)}}/>
      {loading?(
        <><span className="w-8 h-8 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin"/><div className="text-[12px] text-blue-600">{progress}</div></>
      ):(
        <>
          <div className="text-2xl">{drag?'📂':'📥'}</div>
          <div className="text-center">
            <div className="text-[13px] font-bold text-gray-800">{label}</div>
            <div className="text-[11.5px] text-gray-400 mt-1">{hint}</div>
          </div>
          <button type="button" onClick={()=>ref.current?.click()} className="px-4 py-1.5 text-[12px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all">เลือกไฟล์</button>
        </>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────
export function SeamlessPage({
  onOpenSettings,
  sharedSumRows,
  sharedSmtRows,
  onSumRowsChange,
  onSmtRowsChange,
  screeningDB,
}: {
  onOpenSettings?: () => void
  sharedSumRows?: { fiscal_year: string; rep_no: string; b_claim: number; b_comp: number; source_file: string }[]
  sharedSmtRows?: { fiscal_year: string; transferred: number; smt_ref: string; source_file: string }[]
  onSumRowsChange?: (rows: any[]) => void
  onSmtRowsChange?: (rows: any[]) => void
  screeningDB?: ScreeningDB
}) {
  const [indRows,  setIndRows]  = useState<IndividualRow[]>([])
  const [_sumRows, _setSumRows] = useState<SummaryRow[]>([])
  const [_smtRows, _setSmtRows] = useState<SmtRow[]>([])
  const sumRows = (sharedSumRows as SummaryRow[] | undefined) ?? _sumRows
  const smtRows = (sharedSmtRows as SmtRow[] | undefined) ?? _smtRows
  const setSumRows = onSumRowsChange
    ? (updater: SummaryRow[] | ((prev: SummaryRow[]) => SummaryRow[])) => {
        const next = typeof updater === 'function' ? updater(sumRows) : updater
        onSumRowsChange(next)
      }
    : _setSumRows
  const setSmtRows = onSmtRowsChange
    ? (updater: SmtRow[] | ((prev: SmtRow[]) => SmtRow[])) => {
        const next = typeof updater === 'function' ? updater(smtRows) : updater
        onSmtRowsChange(next)
      }
    : _setSmtRows
  const [dbLoading,setDbLoading]= useState(true)

  const [loadingInd, setLoadingInd] = useState(false)
  const [loadingSum, setLoadingSum] = useState(false)
  const [loadingSmt, setLoadingSmt] = useState(false)
  const [progInd, setProgInd] = useState('')
  const [progSum, setProgSum] = useState('')
  const [progSmt, setProgSmt] = useState('')

  const [search,       setSearch]      = useState('')
  const [filterStatus, setFStatus]     = useState('all')
  const [filterType,   setFType]       = useState('all')
  const [filterHsend,  setFHsend]      = useState<string[]>([])
  const [filterRights, setFRights]     = useState<string[]>([])
  const [fiscalYear,   setFiscalYear]  = useState('all')   // ปีงบประมาณ
  const [dateFrom,     setDateFrom]    = useState('')       // ช่วงวันที่ YYYY-MM-DD
  const [dateTo,       setDateTo]      = useState('')
  const [page,         setPage]        = useState(1)
  const [toast,        setToast]       = useState<{msg:string;ok:boolean}|null>(null)
  const [confirmClear, setConfirm]     = useState<'individual'|'summary'|'smt'|null>(null)
  const PG = 50

  // แปลงปีงบ → ช่วงวันที่ (พ.ศ.) เช่น 2567 → 1/10/2566 - 30/9/2567
  const fiscalYearRange = useMemo(()=>{
    if (fiscalYear === 'all') return null
    const y = parseInt(fiscalYear)
    return { from: `${y-1}/10`, to: `${y}/09` } // YYYY/MM สำหรับเปรียบ
  }, [fiscalYear])

  // ฟังก์ชันเปรียบ date string d/M/YYYY กับช่วง
  const inFiscalYear = useCallback((d: string): boolean => {
    if (!fiscalYearRange) return true
    const ds = parseDateParts(d)
    if (!ds) return false
    const ym = `${ds.year}/${ds.month}`
    return ym >= fiscalYearRange.from && ym <= fiscalYearRange.to
  }, [fiscalYearRange])

  // ฟังก์ชันเปรียบ date string d/M/YYYY กับ dateFrom/dateTo (YYYY-MM-DD)
  const inDateRange = useCallback((d: string): boolean => {
    if (!dateFrom && !dateTo) return true
    const ds = parseDateParts(d)
    if (!ds) return false
    // แปลง d/M/YYYY → YYYY-MM-DD
    const iso = `${ds.year}-${ds.month}-${d.split('/')[0].padStart(2,'0')}`
    if (dateFrom && iso < dateFrom) return false
    if (dateTo   && iso > dateTo)   return false
    return true
  }, [dateFrom, dateTo])

  // ฟังก์ชัน filter date รวม (ใช้ fiscalYear หรือ dateRange อย่างใดอย่างหนึ่ง)
  const inActiveRange = useCallback((d: string): boolean => {
    if (dateFrom || dateTo) return inDateRange(d)
    return inFiscalYear(d)
  }, [dateFrom, dateTo, inDateRange, inFiscalYear])

  const showToast = useCallback((msg:string,ok:boolean)=>{ setToast({msg,ok}); setTimeout(()=>setToast(null),5000) },[])

  useEffect(()=>{
    Promise.all([
      fetch('/api/seamless').then(r=>r.json()),
      fetch('/api/rep-summary').then(r=>r.json()),
      fetch('/api/smt').then(r=>r.json()),
    ]).then(([ind,sum,smt])=>{
      if(ind.ok) setIndRows(ind.data)
      if(sum.ok) setSumRows(sum.data)
      if(smt.ok) setSmtRows(smt.data)
    }).catch(e=>showToast(String(e),false))
    .finally(()=>setDbLoading(false))
  },[showToast])

  const repToTransfer = useMemo(()=>{
    const smtMap: Record<string,{date:string;amount:number}> = {}
    for(const s of smtRows){
      if(!smtMap[s.smt_ref]) smtMap[s.smt_ref] = {date:s.transfer_date,amount:0}
      smtMap[s.smt_ref].amount += s.transferred
    }
    const repMap: Record<string,{date:string;amount:number}|null> = {}
    for(const s of sumRows){
      const refs = s.smt_ref.split(',').map(r=>r.trim()).filter(Boolean)
      const found = refs.map(r=>smtMap[r]).find(Boolean)
      repMap[s.rep_no] = found ?? null
    }
    return repMap
  },[sumRows, smtRows])

  const filterOptions = useMemo(()=>({
    years:   [...new Set(indRows.filter(r=>isHepB(r.service_name)||isHepC(r.service_name)).map(r=>parseDateParts(r.service_date)?.year).filter(Boolean))].sort() as string[],
    hsends:  [...new Set(indRows.filter(r=>isHepB(r.service_name)||isHepC(r.service_name)).map(r=>r.hsend||r.hmain||'').filter(Boolean))].sort(),
    rights:  [...new Set(indRows.filter(r=>isHepB(r.service_name)||isHepC(r.service_name)).map(r=>r.rights).filter(Boolean))].sort(),
    sources: [...new Set(indRows.map(r=>r.source_file))],
  }),[indRows])

  const hepRows = useMemo(()=>indRows.filter(r=>isHepB(r.service_name)||isHepC(r.service_name)),[indRows])

  const hepRowsFiltered = useMemo(()=>{
    let r=hepRows
    if(filterHsend.length>0)  r=r.filter(x=>filterHsend.includes(x.hsend||x.hmain||''))
    if(filterRights.length>0) r=r.filter(x=>filterRights.includes(x.rights))
    if(fiscalYear!=='all' || dateFrom || dateTo) r=r.filter(x=>inActiveRange(x.service_date))
    return r
  },[hepRows,filterHsend,filterRights,fiscalYear,dateFrom,dateTo,inActiveRange])

  const stats = useMemo(()=>{
    // ── บี/ซี มาจาก screeningDB (filter HSEND/ปี/เดือน) ──
    const allowedUnits: Set<string> | null =
      filterHsend.length > 0
        ? new Set(filterHsend.flatMap(h => HSEND_UNIT_MAP[h] ?? []))
        : null
    const unitAllowed = (unit: string) => allowedUnits === null || allowedUnits.has(unit)
    const sdb = screeningDB ?? { HBsAg: {}, AntiHCV: {} }

    const bPids = new Set<string>()
    const cPids = new Set<string>()

    for (const byPid of Object.values(sdb.HBsAg)) {
      for (const [pid, pidEntry] of Object.entries(byPid as Record<string, { dates: string[]; unit: string }>)) {
        if (!unitAllowed(pidEntry.unit)) continue
        const hasDate = pidEntry.dates.some(d => inActiveRange(d))
        if (hasDate) bPids.add(pid)
      }
    }
    for (const byPid of Object.values(sdb.AntiHCV)) {
      for (const [pid, pidEntry] of Object.entries(byPid as Record<string, { dates: string[]; unit: string }>)) {
        if (!unitAllowed(pidEntry.unit)) continue
        const hasDate = pidEntry.dates.some(d => inActiveRange(d))
        if (hasDate) cPids.add(pid)
      }
    }

    // ── ชดเชย/ไม่ชดเชย มาจาก seamless_records ──
    const comp=hepRowsFiltered.filter(r=>r.status==='ชดเชย')
    const notComp=hepRowsFiltered.filter(r=>r.status==='ไม่ชดเชย')
    const reasonMap:Record<string,number>={}
    for(const r of notComp){const key=getReasonLabel(r.note,r.note_other);reasonMap[key]=(reasonMap[key]||0)+1}
    // join PID จาก screeningDB กับ seamless_records เพื่อนับชดเชย
    const seamlessB = hepRowsFiltered.filter(r=>isHepB(r.service_name))
    const seamlessC = hepRowsFiltered.filter(r=>isHepC(r.service_name))
    const seamlessBPids = new Set(seamlessB.map(r=>r.pid))
    const seamlessCPids = new Set(seamlessC.map(r=>r.pid))

    const compB    = seamlessB.filter(r=>bPids.has(r.pid)&&r.status==='ชดเชย').length
    const compC    = seamlessC.filter(r=>cPids.has(r.pid)&&r.status==='ชดเชย').length
    const notCompB = seamlessB.filter(r=>bPids.has(r.pid)&&r.status==='ไม่ชดเชย').length
    const notCompC = seamlessC.filter(r=>cPids.has(r.pid)&&r.status==='ไม่ชดเชย').length
    const pendingB = bPids.size - compB - notCompB  // อยู่ใน screeningDB แต่ไม่มีใน seamless
    const pendingC = cPids.size - compC - notCompC

    const totalCompB = seamlessB.filter(r=>bPids.has(r.pid)&&r.status==='ชดเชย').reduce((a,b)=>a+b.compensated,0)
    const totalCompC = seamlessC.filter(r=>cPids.has(r.pid)&&r.status==='ชดเชย').reduce((a,b)=>a+b.compensated,0)

    return {
      total:hepRowsFiltered.length,
      hepB:bPids.size, hepC:cPids.size,
      uniqueB:bPids.size, uniqueC:cPids.size,
      compB, compC, notCompB, notCompC, pendingB, pendingC,
      comp:comp.length, notComp:notComp.length,
      totalComp:comp.reduce((a,b)=>a+b.compensated,0),
      totalCompB, totalCompC,
      totalClaim:hepRowsFiltered.reduce((a,b)=>a+b.total_claim,0),
      reasons:Object.entries(reasonMap).sort((a,b)=>b[1]-a[1]).slice(0,5),
    }
  },[screeningDB, hepRowsFiltered, filterHsend, inActiveRange])

  // ── monthlyData (ใหม่) ──────────────────────────────────────────
  // บาร์ บี/ซี มาจาก screeningDB โดยตรง กรองด้วย unit ตาม HSEND mapping
  // comp/notComp/pending join กับ seamless_records
  const monthlyData = useMemo(()=>{
    // 1. หา unit names ที่ต้อง filter จาก HSEND ที่เลือก
    const allowedUnits: Set<string> | null =
      filterHsend.length > 0
        ? new Set(filterHsend.flatMap(h => HSEND_UNIT_MAP[h] ?? []))
        : null

    // 2. สร้าง pidStatus จาก seamless_records สำหรับ classify comp/notComp/pending
    const pidStatusB: Record<string, string> = {}
    const pidStatusC: Record<string, string> = {}
    for (const r of hepRowsFiltered) {
      if (isHepB(r.service_name)) {
        if (r.status === 'ชดเชย' || !pidStatusB[r.pid]) pidStatusB[r.pid] = r.status
      } else {
        if (r.status === 'ชดเชย' || !pidStatusC[r.pid]) pidStatusC[r.pid] = r.status
      }
    }

    // 3. นับ unique PID ต่อเดือนจาก screeningDB โดยตรง (ไม่พึ่ง seamless_records)
    const bPids: Record<string, Set<string>> = {}
    const cPids: Record<string, Set<string>> = {}

    const unitAllowed = (unit: string) =>
      allowedUnits === null || allowedUnits.has(unit)

    const sdb = screeningDB ?? { HBsAg: {}, AntiHCV: {} }

    // HBsAg
    for (const byPid of Object.values(sdb.HBsAg)) {
      for (const [pid, pidEntry] of Object.entries(byPid as Record<string, { dates: string[]; unit: string }>)) {
        if (!unitAllowed(pidEntry.unit)) continue
        if (filterRights.length > 0) {
          const row = hepRows.find(r => r.pid === pid)
          if (!row || !filterRights.includes(row.rights)) continue
        }
        for (const d of pidEntry.dates) {
          const ds = parseDateParts(d)
          if (!ds) continue
          if (!inActiveRange(d)) continue
          const k = `${ds.year}/${ds.month}`
          if (!bPids[k]) bPids[k] = new Set()
          bPids[k].add(pid)
        }
      }
    }
    // AntiHCV
    for (const byPid of Object.values(sdb.AntiHCV)) {
      for (const [pid, pidEntry] of Object.entries(byPid as Record<string, { dates: string[]; unit: string }>)) {
        if (!unitAllowed(pidEntry.unit)) continue
        if (filterRights.length > 0) {
          const row = hepRows.find(r => r.pid === pid)
          if (!row || !filterRights.includes(row.rights)) continue
        }
        for (const d of pidEntry.dates) {
          const ds = parseDateParts(d)
          if (!ds) continue
          if (!inActiveRange(d)) continue
          const k = `${ds.year}/${ds.month}`
          if (!cPids[k]) cPids[k] = new Set()
          cPids[k].add(pid)
        }
      }
    }

    // 4. classify comp/notComp/pending ต่อเดือน
    const compMap: Record<string, { comp: number; notComp: number; pending: number }> = {}
    const allMonths = new Set([...Object.keys(bPids), ...Object.keys(cPids)])
    for (const k of allMonths) {
      const cm = { comp: 0, notComp: 0, pending: 0 }
      for (const pid of bPids[k] ?? []) {
        const st = pidStatusB[pid]
        if (st === 'ชดเชย') cm.comp++
        else if (st === 'ไม่ชดเชย') cm.notComp++
        else cm.pending++
      }
      for (const pid of cPids[k] ?? []) {
        const st = pidStatusC[pid]
        if (st === 'ชดเชย') cm.comp++
        else if (st === 'ไม่ชดเชย') cm.notComp++
        else cm.pending++
      }
      compMap[k] = cm
    }

    // 5. เส้นยอดชดเชย (฿) มาจาก seamless_records เหมือนเดิม
    const pay: Record<string, { amount: number }> = {}
    for (const r of hepRowsFiltered) {
      if (!r.service_date) continue
      const ds = parseDateParts(r.service_date)
      if (!ds) continue
      if (!inActiveRange(r.service_date)) continue
      const k = `${ds.year}/${ds.month}`
      if (!pay[k]) pay[k] = { amount: 0 }
      pay[k].amount += r.compensated
    }

    // 6. รวมและ sort
    const all = [...allMonths].sort()
    return all.map(label => ({
      label,
      b:       bPids[label]?.size ?? 0,
      c:       cPids[label]?.size ?? 0,
      comp:    compMap[label]?.comp ?? 0,
      notComp: compMap[label]?.notComp ?? 0,
      pending: compMap[label]?.pending ?? 0,
      amount:  pay[label]?.amount ?? 0,
    }))
  },[
    screeningDB,
    hepRows,
    hepRowsFiltered,
    filterHsend,
    filterRights,
    inActiveRange,
  ])

  const filtered = useMemo(()=>{
    let r=filterType==='hepB'?hepRowsFiltered.filter(x=>isHepB(x.service_name)):filterType==='hepC'?hepRowsFiltered.filter(x=>isHepC(x.service_name)):hepRowsFiltered
    if(filterStatus!=='all')r=r.filter(x=>x.status===filterStatus)
    if(search.trim()){const q=search.trim().toLowerCase();r=r.filter(x=>x.name.toLowerCase().includes(q)||x.pid.includes(q)||x.rep_no.toLowerCase().includes(q))}
    return r
  },[hepRowsFiltered,filterType,filterStatus,search])

  const totalPages=Math.ceil(filtered.length/PG)
  const pageRows=filtered.slice((page-1)*PG,page*PG)
  const hasFilter=filterHsend.length>0||filterRights.length>0||fiscalYear!=='all'||!!dateFrom||!!dateTo
  const clearAllFilters=()=>{setFHsend([]);setFRights([]);setFiscalYear('all');setDateFrom('');setDateTo('');setPage(1)}

  const DONUT_REASONS=stats.reasons.map(([label,val],i)=>({label:label.length>32?label.slice(0,32)+'…':label,value:val,color:['#ef4444','#f97316','#eab308','#8b5cf6','#6b7280'][i]??'#9ca3af'}))
  const DONUT_RIGHTS=[...new Set(hepRowsFiltered.map(r=>r.rights).filter(Boolean))].slice(0,5).map((key,i)=>({label:RIGHTS_LABEL[key]??key,value:hepRowsFiltered.filter(r=>r.rights===key).length,color:['#2563eb','#059669','#f59e0b','#8b5cf6','#06b6d4'][i]??'#9ca3af'}))

  function exportCsv(rows:IndividualRow[]) {
    const h=['ลำดับ','REP No.','Trans ID','HN','PID','ชื่อ-สกุล','สิทธิ','หน่วยบริการ','HSEND','วันที่ส่ง','วันที่บริการ','รายการบริการ','ขอเบิก','ชดเชย','สถานะ','สถานะโอนเงิน','วันโอน','หมายเหตุ']
    const d=rows.map((r,i)=>{const tr=repToTransfer[r.rep_no];return[i+1,r.rep_no,r.trans_id,r.hn,r.pid,r.name,r.rights,r.hmain,r.hsend,r.send_date,r.service_date,r.service_name,r.total_claim,r.compensated,r.status,tr?'โอนแล้ว':'รอโอน',tr?.date??'',getReasonLabel(r.note,r.note_other)].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')})
    const b=new Blob(['\uFEFF'+[h.join(','),...d].join('\n')],{type:'text/csv;charset=utf-8;'})
    const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`seamless_${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(u)
  }

  const handleIndFiles = useCallback(async(files:File[])=>{
    const valid = files.filter(f=>/\.(xlsx|xls)$/i.test(f.name))
    if(!valid.length){showToast('กรุณาเลือกไฟล์ .xlsx',false);return}
    setLoadingInd(true); let totalNew=0,totalSkip=0
    for(const f of valid){
      setProgInd(`กำลัง parse: ${f.name}`)
      const {rows:parsed,error} = await parseIndividual(f)
      if(error){showToast(`อ่านไฟล์ไม่สำเร็จ: ${error}`,false);continue}
      if(!parsed.length){showToast(`ไม่พบข้อมูล`,false);continue}
      const BATCH=500; const batches=Math.ceil(parsed.length/BATCH); let ok=true
      for(let b=0;b<batches;b++){
        const chunk=parsed.slice(b*BATCH,(b+1)*BATCH)
        setProgInd(`บันทึก batch ${b+1}/${batches}...`)
        const j=await fetch('/api/seamless',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:chunk})}).then(r=>r.json())
        if(j.ok){totalNew+=j.imported??0;totalSkip+=chunk.length-(j.imported??0);setIndRows(prev=>{const ex=new Set(prev.map(r=>`${r.trans_id}|${r.item_seq}`));return[...prev,...chunk.filter(r=>!ex.has(`${r.trans_id}|${r.item_seq}`))]})}
        else{showToast(`batch ${b+1} ล้มเหลว: ${j.error}`,false);ok=false;break}
      }
      if(!ok)continue
    }
    showToast(totalNew>0?`✓ เพิ่มใหม่ ${fmtNum(totalNew)} · ข้ามซ้ำ ${fmtNum(totalSkip)} รายการ`:`ไม่มีข้อมูลใหม่`,totalNew>0)
    setPage(1);setProgInd('');setLoadingInd(false)
  },[showToast])

  const handleSumFiles = useCallback(async(files:File[])=>{
    const valid=files.filter(f=>/\.(xlsx|xls)$/i.test(f.name))
    if(!valid.length){showToast('กรุณาเลือกไฟล์ .xlsx',false);return}
    setLoadingSum(true); let total=0
    for(const f of valid){
      setProgSum(`กำลัง parse: ${f.name}`)
      const {rows:parsed,error}=await parseSummary(f)
      if(error){showToast(`อ่านไฟล์ไม่สำเร็จ: ${error}`,false);continue}
      setProgSum(`บันทึก ${parsed.length} รายการ...`)
      const j=await fetch('/api/rep-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:parsed})}).then(r=>r.json())
      if(j.ok){total+=j.imported??0;setSumRows(prev=>{const ex=new Set(prev.map(r=>r.rep_no));return[...prev,...parsed.filter(r=>!ex.has(r.rep_no))]})}
      else showToast(`บันทึกไม่สำเร็จ: ${j.error}`,false)
    }
    showToast(`✓ REP Summary เพิ่มใหม่ ${fmtNum(total)} รายการ`,total>0)
    setProgSum('');setLoadingSum(false)
  },[showToast])

  const handleSmtFiles = useCallback(async(files:File[])=>{
    const valid=files.filter(f=>/\.(xlsx|xls)$/i.test(f.name))
    if(!valid.length){showToast('กรุณาเลือกไฟล์ .xlsx',false);return}
    setLoadingSmt(true); let total=0
    for(const f of valid){
      setProgSmt(`กำลัง parse: ${f.name}`)
      const {rows:parsed,error}=await parseSmt(f)
      if(error){showToast(`อ่านไฟล์ไม่สำเร็จ: ${error}`,false);continue}
      if(!parsed.length){showToast(`ไม่พบรายการ DKTP ในไฟล์ ${f.name}`,false);continue}
      setProgSmt(`บันทึก ${parsed.length} รายการ DKTP...`)
      const j=await fetch('/api/smt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rows:parsed})}).then(r=>r.json())
      if(j.ok){total+=j.imported??0;setSmtRows(prev=>{const ex=new Set(prev.map(r=>`${r.smt_ref}|${r.batch_no}|${r.fund_sub}`));return[...prev,...parsed.filter(r=>!ex.has(`${r.smt_ref}|${r.batch_no}|${r.fund_sub}`))]})}
      else showToast(`บันทึกไม่สำเร็จ: ${j.error}`,false)
    }
    showToast(`✓ SMT DKTP เพิ่มใหม่ ${fmtNum(total)} รายการ`,total>0)
    setProgSmt('');setLoadingSmt(false)
  },[showToast])

  const handleClear = useCallback(async(type:'individual'|'summary'|'smt')=>{
    setConfirm(null)
    const url = type==='individual'?'/api/seamless':type==='summary'?'/api/rep-summary':'/api/smt'
    const j=await fetch(url,{method:'DELETE'}).then(r=>r.json())
    if(j.ok){
      if(type==='individual')setIndRows([])
      if(type==='summary')setSumRows([])
      if(type==='smt')setSmtRows([])
      showToast('✓ ล้างข้อมูลเรียบร้อย',true)
    } else showToast(j.error,false)
  },[showToast])

  if (dbLoading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin"/>
      <div className="text-[13px] text-gray-500">กำลังโหลดข้อมูล...</div>
    </div>
  )

  return (
    <div className="max-w-[1440px] mx-auto px-8 py-7">
      {toast&&<div className={cn('fixed bottom-7 right-7 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl border text-sm shadow-xl',toast.ok?'bg-emerald-50 border-emerald-200 text-emerald-800':'bg-red-50 border-red-200 text-red-800')}><span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',toast.ok?'bg-emerald-500':'bg-red-500')}>{toast.ok?'✓':'✕'}</span>{toast.msg}</div>}

      {confirmClear&&<div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-6" onClick={()=>setConfirm(null)}><div className="bg-white rounded-2xl shadow-2xl w-full max-w-[380px] p-7" onClick={e=>e.stopPropagation()}><div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="w-6 h-6"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg></div><div className="text-center mb-5"><div className="text-[16px] font-bold text-gray-900 mb-1">ยืนยันการล้างข้อมูล</div><div className="text-[13px] text-gray-500">ลบข้อมูล {confirmClear==='individual'?'REP Individual':confirmClear==='summary'?'REP Summary':'SMT'} ทั้งหมด</div><div className="text-[11px] text-red-500 mt-2">⚠ ไม่สามารถยกเลิกได้</div></div><div className="flex gap-2 justify-center"><button onClick={()=>setConfirm(null)} className="px-5 py-2 text-[12.5px] font-semibold border border-gray-200 rounded-lg text-gray-500">ยกเลิก</button><button onClick={()=>handleClear(confirmClear)} className="px-5 py-2 text-[12.5px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg">ล้างข้อมูล</button></div></div></div>}

      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full mb-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"/>Seamless For DMIS · Supabase</div>
          <h1 className="text-[20px] font-black text-gray-900">ติดตามการจ่ายชดเชยไวรัสตับอักเสบ บี &amp; ซี</h1>
          <div className="text-[12px] text-gray-400 mt-0.5">{fmtNum(indRows.length)} รายการ Individual · {fmtNum(sumRows.length)} REP Summary · {fmtNum(smtRows.length)} SMT DKTP</div>
        </div>
      </div>

      {/* Upload zones */}
      {indRows.length === 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <UploadZone label="REP Individual" hint="ไฟล์ Excel จาก Seamless DMIS" accept=".xlsx,.xls" onFiles={handleIndFiles} loading={loadingInd} progress={progInd}/>
          <UploadZone label="REP Summary" hint="ไฟล์สรุปการเบิกจ่าย DKTP" accept=".xlsx,.xls" onFiles={handleSumFiles} loading={loadingSum} progress={progSum}/>
          <UploadZone label="SMT Transfer" hint="ไฟล์ Smart Money Transfer" accept=".xlsx,.xls" onFiles={handleSmtFiles} loading={loadingSmt} progress={progSmt}/>
        </div>
      )}

      {indRows.length > 0 && <>
        {/* Filter bar */}
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 mb-5 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">กรองข้อมูล:</span>
            {/* ปีงบประมาณ */}
            <select
              value={fiscalYear}
              onChange={e=>{setFiscalYear(e.target.value);setDateFrom('');setDateTo('');setPage(1)}}
              className="pl-3 pr-7 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 cursor-pointer appearance-none">
              <option value="all">ทุกปีงบ</option>
              {['2567','2568','2569','2570'].map(y=><option key={y} value={y}>ปีงบ {y}</option>)}
            </select>
            {/* ช่วงวันที่อิสระ */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400">หรือ</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e=>{setDateFrom(e.target.value);setFiscalYear('all');setPage(1)}}
                className="px-2.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                placeholder="วันเริ่มต้น"
              />
              <span className="text-[11px] text-gray-400">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={e=>{setDateTo(e.target.value);setFiscalYear('all');setPage(1)}}
                className="px-2.5 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                placeholder="วันสิ้นสุด"
              />
              {(dateFrom||dateTo)&&<button type="button" onClick={()=>{setDateFrom('');setDateTo('');setPage(1)}} className="text-[10.5px] text-gray-400 hover:text-red-500">✕</button>}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-gray-400 font-semibold">HSEND:</span>
              {Object.keys(HSEND_UNIT_MAP).map(h=>(
                <button key={h} type="button"
                  onClick={()=>{setFHsend(p=>p.includes(h)?p.filter(v=>v!==h):[...p,h]);setPage(1)}}
                  className={cn('px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all',
                    filterHsend.includes(h)?'bg-blue-600 border-blue-600 text-white':'bg-white border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600')}>
                  {h}
                </button>
              ))}
              {filterHsend.length>0&&<button type="button" onClick={()=>{setFHsend([]);setPage(1)}} className="px-2 py-1 text-[10.5px] text-gray-400 hover:text-red-500 transition-all">ล้าง</button>}
            </div>
            <select value="" onChange={e=>{if(!e.target.value)return;setFRights(p=>p.includes(e.target.value)?p.filter(v=>v!==e.target.value):[...p,e.target.value]);setPage(1)}} className="pl-3 pr-7 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 cursor-pointer appearance-none">
              <option value="">สิทธิ{filterRights.length>0?` ✓${filterRights.length}`:''}</option>
              {filterOptions.rights.map(r=><option key={r} value={r}>{filterRights.includes(r)?'✓ ':''}{RIGHTS_LABEL[r]??r}</option>)}
            </select>
            {hasFilter&&<button type="button" onClick={clearAllFilters} className="px-3 py-1.5 text-[11.5px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-all">ล้างตัวกรอง</button>}
          </div>
          {hasFilter&&<div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {fiscalYear!=='all'&&<Chip label={`ปีงบ ${fiscalYear}`} onRemove={()=>{setFiscalYear('all');setPage(1)}} color="purple"/>}
            {dateFrom&&<Chip label={`ตั้งแต่ ${dateFrom}`} onRemove={()=>{setDateFrom('');setPage(1)}} color="purple"/>}
            {dateTo&&<Chip label={`ถึง ${dateTo}`} onRemove={()=>{setDateTo('');setPage(1)}} color="purple"/>}
            {filterRights.map(r=><Chip key={r} label={RIGHTS_LABEL[r]??r} onRemove={()=>{setFRights(p=>p.filter(v=>v!==r));setPage(1)}} color="green"/>)}
          </div>}
        </div>

        {/* แสดงชื่อหน่วยบริการเมื่อเลือก HSEND */}
        {filterHsend.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filterHsend.map(h => (
              <div key={h} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                <span className="text-[11px] font-black text-blue-400 font-mono">{h}</span>
                <span className="text-[13px] font-bold text-blue-800">{HSEND_UNIT_NAME[h] ?? h}</span>
              </div>
            ))}
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4 mb-5">
          <KpiCard icon="🔬" label="บริการตับอักเสบ บี" val={fmtNum(stats.hepB)} sub={`${fmtNum(stats.uniqueB)} คน`} barColor="#2563eb" bar={stats.total?stats.hepB/stats.total:0}/>
          <KpiCard icon="🧬" label="บริการตับอักเสบ ซี" val={fmtNum(stats.hepC)} sub={`${fmtNum(stats.uniqueC)} คน`} barColor="#0891b2" bar={stats.total?stats.hepC/stats.total:0}/>
          <KpiCard icon="✅" label="ได้รับการชดเชย" val={`${fmtNum(stats.comp)} รายการ`} sub={`${stats.total?(stats.comp/stats.total*100).toFixed(1):0}%`} sub2={`฿${fmtBaht(stats.totalComp)}`} barColor="#059669" bar={stats.total?stats.comp/stats.total:0}/>
          <KpiCard icon="❌" label="ไม่ได้รับการชดเชย" val={`${fmtNum(stats.notComp)} รายการ`} sub={`฿${fmtBaht(stats.totalClaim-stats.totalComp)}`} barColor="#dc2626" bar={stats.total?stats.notComp/stats.total:0}/>
        </div>

        {/* Monthly chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 pb-3 shadow-sm mb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-indigo-500"/>
            <span className="font-bold text-gray-900 text-[13.5px]">แนวโน้มรายเดือน</span>
            <span className="ml-2 text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{monthlyData.length} เดือน</span>
          </div>
          <div className="w-full overflow-x-auto">{monthlyData.length>0?<MonthlyChart data={monthlyData} hasSmt={smtRows.length>0}/>:<div className="flex items-center justify-center h-52 text-gray-300 text-sm">ไม่มีข้อมูล</div>}</div>
        </div>

        {/* Donut row */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-indigo-500"/>
              <span className="font-bold text-gray-900 text-[13px]">การตรวจคัดกรองไวรัสตับอักเสบ</span>
            </div>
            <CompareBarChart items={[
              {label:'ไวรัสตับอักเสบ บี (HBsAg)', total:stats.hepB, comp:stats.compB, unique:stats.uniqueB, color:'#2563eb'},
              {label:'ไวรัสตับอักเสบ ซี (Anti-HCV)', total:stats.hepC, comp:stats.compC, unique:stats.uniqueC, color:'#0891b2'},
            ]}/>
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 text-[11.5px]">
              <div className="flex justify-between"><span className="text-gray-500">รวมทั้งหมด</span><span className="font-bold">{fmtNum(stats.total)} รายการ</span></div>
              <div className="flex justify-between"><span className="text-gray-500">ยอดชดเชย</span><span className="font-bold text-emerald-600">฿{fmtBaht(stats.totalComp)}</span></div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4"><div className="w-2 h-2 rounded-full bg-amber-500"/><span className="font-bold text-gray-900 text-[13px]">สิทธิการรักษา</span></div>
            <DonutChart size={130} slices={DONUT_RIGHTS}/>
          </div>
        </div>

        {/* Summary + Reasons */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <SummaryCard title="ตับอักเสบ บี" rows={hepRowsFiltered.filter(r=>isHepB(r.service_name))} color="#2563eb" bgColor="#eff6ff" totalOverride={stats.hepB} compOverride={stats.compB} notCompOverride={stats.notCompB} pendingOverride={stats.pendingB} totalCompOverride={stats.totalCompB}/>
          <SummaryCard title="ตับอักเสบ ซี" rows={hepRowsFiltered.filter(r=>isHepC(r.service_name))} color="#0891b2" bgColor="#ecfeff" totalOverride={stats.hepC} compOverride={stats.compC} notCompOverride={stats.notCompC} pendingOverride={stats.pendingC} totalCompOverride={stats.totalCompC}/>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4"><div className="w-2 h-2 rounded-full bg-red-500"/><span className="font-bold text-gray-900 text-[13px]">สาเหตุไม่ชดเชย ({fmtNum(stats.notComp)})</span></div>
            <DonutChart size={110} slices={DONUT_REASONS}/>
            <div className="mt-3 space-y-1.5">{stats.reasons.map(([label,val],i)=>(<div key={i} className="flex items-start gap-2"><div className="w-2 h-2 rounded-sm mt-1 flex-shrink-0" style={{background:['#ef4444','#f97316','#eab308','#8b5cf6','#6b7280'][i]}}/><span className="text-[11px] text-gray-600 flex-1 leading-tight">{label}</span><span className="text-[11px] font-bold text-gray-500 flex-shrink-0">{val}</span></div>))}</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-wrap gap-3">
            <div className="flex items-center gap-2.5"><div className="w-2 h-2 rounded-full bg-indigo-500"/><div className="font-bold text-gray-900 text-[13.5px]">รายการบริการตับอักเสบ</div></div>
            <div className="flex flex-wrap gap-2">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">{[['all','ทั้งหมด'],['hepB','บี'],['hepC','ซี']].map(([v,l])=><button key={v} type="button" onClick={()=>{setFType(v);setPage(1)}} className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',filterType===v?'bg-white font-bold text-blue-600 shadow-sm':'text-gray-500 hover:text-blue-500')}>{l}</button>)}</div>
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">{[['all','ทั้งหมด'],['ชดเชย','ชดเชย'],['ไม่ชดเชย','ไม่ชดเชย']].map(([v,l])=><button key={v} type="button" onClick={()=>{setFStatus(v);setPage(1)}} className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',filterStatus===v?'bg-white font-bold text-blue-600 shadow-sm':'text-gray-500 hover:text-blue-500')}>{l}</button>)}</div>
              <div className="relative"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/></svg><input className="pl-9 pr-3 py-2 text-[12.5px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 w-[200px]" placeholder="ค้นหาชื่อ, PID, REP No..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/></div>
              <button type="button" onClick={()=>exportCsv(filtered)} className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><path d="M8 2v8M5 7l3 3 3-3M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1"/></svg>Export CSV</button>
              <button type="button" onClick={()=>setConfirm('individual')} className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-red-50 border border-red-200 text-red-500 rounded-lg hover:bg-red-100 transition-all">ล้างข้อมูล</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-[12px]">
            <StatChip dot="#6b7280" label="แสดง" val={fmtNum(filtered.length)} unit="รายการ"/>
            <div className="w-px bg-gray-200 self-stretch"/>
            <StatChip dot="#059669" label="ชดเชยรวม" val={`฿${fmtBaht(filtered.filter(r=>r.status==='ชดเชย').reduce((a,b)=>a+b.compensated,0))}`} unit=""/>
            <div className="w-px bg-gray-200 self-stretch"/>
            <StatChip dot="#dc2626" label="ไม่ชดเชย" val={fmtNum(filtered.filter(r=>r.status==='ไม่ชดเชย').length)} unit="รายการ"/>
          </div>
          <div className="overflow-x-auto" style={{maxHeight:'60vh'}}>
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b-2 border-gray-100">
                <tr>{['#','REP No.','ชื่อ-สกุล','PID','สิทธิ','วันที่บริการ','วันที่ส่ง','รายการบริการ','ขอเบิก','ชดเชย','สถานะ','สถานะโอน','วันโอน','HSEND','หมายเหตุ'].map(h=><th key={h} className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {pageRows.length===0?<tr><td colSpan={15} className="text-center py-16 text-gray-400"><div className="text-3xl mb-3 opacity-40">🔍</div><div className="text-[13px]">ไม่พบข้อมูล</div></td></tr>:pageRows.map((r,i)=>{
                  const reason=getReasonLabel(r.note,r.note_other)
                  const tr=repToTransfer[r.rep_no]
                  return <tr key={r.id??`${r.trans_id}-${r.item_seq}-${i}`} className="border-b border-gray-100 hover:bg-blue-50/50 transition-all even:bg-gray-50/30">
                    <td className="px-3 py-2.5 text-gray-400 font-mono text-[11px]">{(page-1)*PG+i+1}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600 whitespace-nowrap">{r.rep_no}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{r.pid}</td>
                    <td className="px-3 py-2.5"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',r.rights==='UCS'?'bg-blue-100 text-blue-700':r.rights==='SSS'?'bg-orange-100 text-orange-700':r.rights==='WEL'?'bg-purple-100 text-purple-700':r.rights==='OFC'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600')}>{r.rights||'—'}</span></td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.service_date}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px] whitespace-nowrap">{r.send_date}</td>
                    <td className="px-3 py-2.5"><span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold',isHepB(r.service_name)?'bg-blue-50 text-blue-700 border border-blue-200':'bg-cyan-50 text-cyan-700 border border-cyan-200')}>{isHepB(r.service_name)?'🟦':'🔵'}<span className="truncate max-w-[180px]">{r.service_name}</span></span></td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold text-gray-700">{r.total_claim>0?fmtBaht(r.total_claim):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold"><span className={r.compensated>0?'text-emerald-600':'text-gray-300'}>{r.compensated>0?fmtBaht(r.compensated):'—'}</span></td>
                    <td className="px-3 py-2.5 text-center"><span className={cn('inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap',r.status==='ชดเชย'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600')}>{r.status==='ชดเชย'?'✓ ชดเชย':'✕ ไม่ชดเชย'}</span></td>
                    <td className="px-3 py-2.5 text-center">
                      {r.status==='ไม่ชดเชย'
                        ? <span className="text-gray-300 text-[11px]">—</span>
                        : sumRows.length===0
                          ? <span className="text-gray-300 text-[11px]">—</span>
                          : tr
                            ? <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">✓ โอนแล้ว</span>
                            : <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">⏳ รอโอน</span>
                      }
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-500 whitespace-nowrap">{r.status!=='ไม่ชดเชย' && tr ? isoToThai(tr.date) : '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-gray-500">{r.hsend||r.hmain||'—'}</td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-400 max-w-[160px]"><span className="truncate block" title={reason}>{reason==='ไม่ระบุ'?'—':reason}</span></td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
          {totalPages>1&&<div className="flex items-center gap-1.5 px-6 py-4 border-t border-gray-100 flex-wrap">
            <button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)} className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400">‹</button>
            {Array.from({length:Math.min(totalPages,10)},(_,i)=>{const p=totalPages<=10?i+1:Math.max(1,Math.min(page-4,totalPages-9))+i;return<button key={p} type="button" onClick={()=>setPage(p)} className={cn('px-3 py-1.5 text-[12px] border rounded-lg transition-all',p===page?'bg-blue-600 border-blue-600 text-white font-semibold':'bg-white border-gray-200 text-gray-500 hover:border-blue-400')}>{p}</button>})}
            <button type="button" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400">›</button>
            <span className="text-[12px] text-gray-400 ml-2">หน้า {page}/{totalPages} · {fmtNum(filtered.length)} รายการ</span>
          </div>}
        </div>
      </>}
    </div>
  )
}