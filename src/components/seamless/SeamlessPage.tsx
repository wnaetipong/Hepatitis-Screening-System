'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────
interface SeamlessRow {
  id?: number
  seq: string; rep_no: string; trans_id: string; hn: string; pid: string
  name: string; rights: string; hmain: string; send_date: string
  service_date: string; item_seq: string; service_name: string
  qty: number; price: number; ceiling: number; total_claim: number
  ps_code: string; ps_pct: number; compensated: number; not_comp: number
  extra: number; recall: number; status: string; note: string
  note_other: string; hsend: string; source_file: string; imported_at?: string
}

// ── SheetJS ────────────────────────────────────────────────────────
declare global {
  interface Window {
    XLSX: {
      read: (data: string, opts: { type: string; cellDates?: boolean }) => {
        SheetNames: string[]
        Sheets: Record<string, { '!ref'?: string; [key: string]: unknown }>
      }
      utils: { sheet_to_json: <T>(ws: unknown, opts: object) => T[] }
    }
  }
}
let xlsxReady = false
async function loadSheetJS() {
  if (xlsxReady && window.XLSX) return window.XLSX
  return new Promise<typeof window.XLSX>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => { xlsxReady = true; resolve(window.XLSX) }
    s.onerror = () => reject(new Error('โหลด SheetJS ไม่สำเร็จ'))
    document.head.appendChild(s)
  })
}

function colIdxToLetter(idx1based: number): string {
  return idx1based > 26
    ? String.fromCharCode(64 + Math.floor((idx1based - 1) / 26)) + String.fromCharCode(65 + (idx1based - 1) % 26)
    : String.fromCharCode(64 + idx1based)
}

async function parseSeamlessXlsx(file: File): Promise<{ rows: SeamlessRow[]; error?: string }> {
  try {
    const XLSX = await loadSheetJS()
    const bstr = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.onerror = () => rej(new Error('อ่านไฟล์ไม่สำเร็จ')); r.readAsBinaryString(file)
    })
    const wb = XLSX.read(bstr, { type: 'binary', cellDates: false })
    if (!wb.SheetNames.length) return { rows: [], error: 'ไม่พบ sheet' }
    const ws = wb.Sheets[wb.SheetNames[0]]
    // override wrong dimension ref
    const cellKeys = Object.keys(ws).filter(k => !k.startsWith('!'))
    if (cellKeys.length > 0) {
      let maxRow = 0, maxColIdx = 0
      for (const key of cellKeys) {
        const match = key.match(/^([A-Z]+)(\d+)$/)
        if (match) {
          const row = parseInt(match[2])
          const colIdx = match[1].split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0)
          if (row > maxRow) maxRow = row
          if (colIdx > maxColIdx) maxColIdx = colIdx
        }
      }
      ws['!ref'] = `A1:${colIdxToLetter(maxColIdx)}${maxRow}`
    }
    const raw = XLSX.utils.sheet_to_json<(string|number|null)[]>(ws, { header: 1, defval: '', raw: true }) as (string|number|null)[][]
    const c = (row: (string|number|null)[], i: number) => { const v = row[i]; if (v === null || v === undefined || v === '') return ''; return String(v).trim() }
    const n = (row: (string|number|null)[], i: number) => { const v = parseFloat(String(row[i] ?? '')); return isNaN(v) ? 0 : v }
    let dataStart = 10
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      if (raw[i].map(v => String(v ?? '')).join('|').includes('ลำดับที่') && raw[i].map(v => String(v ?? '')).join('|').includes('REP')) { dataStart = i + 3; break }
    }
    const rows: SeamlessRow[] = []
    for (let i = dataStart; i < raw.length; i++) {
      const row = raw[i]; const repNo = c(row,1), transId = c(row,2); if (!repNo || !transId) continue
      rows.push({ seq:c(row,0), rep_no:repNo, trans_id:transId, hn:c(row,3), pid:c(row,5), name:c(row,6), rights:c(row,7), hmain:c(row,8), send_date:c(row,9), service_date:c(row,10), item_seq:c(row,11), service_name:c(row,12), qty:n(row,13), price:n(row,14), ceiling:n(row,15), total_claim:n(row,16), ps_code:c(row,17), ps_pct:n(row,18), compensated:n(row,19), not_comp:n(row,20), extra:n(row,21), recall:n(row,22), status:c(row,23), note:c(row,24), note_other:c(row,25), hsend:c(row,26), source_file:file.name })
    }
    return { rows }
  } catch (e) { return { rows: [], error: String(e) } }
}

// ── Helpers ────────────────────────────────────────────────────────
const isHepB = (s: string) => s.includes('ไวรัสตับอักเสบ บี') || s.includes('HBsAg')
const isHepC = (s: string) => s.includes('ไวรัสตับอักเสบ ซี') || s.includes('Anti-HCV')
const fmtBaht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtNum  = (n: number) => n.toLocaleString('th-TH')

// แปลง service_date (dd/mm/yyyy พ.ศ.) → ปี พ.ศ. + เดือน
function parseDateParts(d: string): { year: string; month: string } | null {
  const parts = d.split('/')
  if (parts.length !== 3) return null
  return { month: parts[1].padStart(2,'0'), year: parts[2] }
}

function getReasonLabel(note: string, noteOther: string): string {
  const raw = note || ''
  if (raw.startsWith('C305')) return 'ไม่พบการแสดงตนยืนยันสิทธิ (C305)'
  if (raw.startsWith('KT099')) return 'จ่ายชดเชยจากกองทุนประกันสังคม (KT099)'
  if (noteOther && noteOther.includes('เรียกเงินคืน')) return 'เรียกคืนเนื่องจากจ่ายซ้ำซ้อน'
  const cleaned = raw.replace(/^[A-Z0-9]+##/, '').trim()
  return cleaned || noteOther.trim() || 'ไม่ระบุ'
}

const RIGHTS_LABEL: Record<string, string> = { UCS:'บัตรทอง', WEL:'สวัสดิการข้าราชการ', SSS:'ประกันสังคม', OFC:'ต่างด้าว', LGO:'อปท.' }
const MONTH_TH = ['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

// ── Monthly Chart ─────────────────────────────────────────────────
function MiniBarChart({ data }: { data: { label: string; b: number; c: number; comp: number; amount: number }[] }) {
  const [hov, setHov] = useState<number|null>(null)
  if (!data.length) return (
    <div className="flex items-center justify-center h-52 text-gray-300 text-sm">ไม่มีข้อมูล</div>
  )

  const W = 960, H = 240
  const PAD = { t: 36, b: 56, l: 56, r: 64 }
  const chartW = W - PAD.l - PAD.r
  const chartH = H - PAD.t - PAD.b

  // left axis: บริการ (B+C)
  const maxSvc  = Math.max(...data.map(d => d.b + d.c), 1)
  const magSvc  = Math.pow(10, Math.floor(Math.log10(maxSvc)))
  const niceL   = Math.ceil(maxSvc / magSvc) * magSvc

  // right axis: ชดเชย (จำนวนรายการ)
  const maxComp = Math.max(...data.map(d => d.comp), 1)
  const magComp = Math.pow(10, Math.floor(Math.log10(maxComp)))
  const niceR   = Math.ceil(maxComp / magComp) * magComp

  const n = data.length
  const slotW = chartW / n
  const bw = Math.max(7, Math.min(18, slotW / 2.6))
  const GRIDS = 4

  // comp line points (right axis scale)
  const linePoints = data.map((d, i) => {
    const x = PAD.l + slotW * i + slotW / 2
    const y = PAD.t + chartH * (1 - d.comp / niceR)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // area under comp line
  const areaPoints = [
    `${(PAD.l + slotW * 0 + slotW/2).toFixed(1)},${(PAD.t + chartH).toFixed(1)}`,
    ...data.map((d,i) => {
      const x = PAD.l + slotW * i + slotW / 2
      const y = PAD.t + chartH * (1 - d.comp / niceR)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }),
    `${(PAD.l + slotW * (n-1) + slotW/2).toFixed(1)},${(PAD.t + chartH).toFixed(1)}`,
  ].join(' ')

  return (
    <div className="w-full" onMouseLeave={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{height:'auto', overflow:'visible'}}>
        <defs>
          <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6"/><stop offset="100%" stopColor="#1e40af"/>
          </linearGradient>
          <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#0891b2"/>
          </linearGradient>
          <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.01"/>
          </linearGradient>
          <filter id="ds"><feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.12"/></filter>
          <filter id="ds2"><feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.18"/></filter>
          <clipPath id="chartClip">
            <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH}/>
          </clipPath>
        </defs>

        {/* chart bg */}
        <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH} fill="#f9fafb" rx="6"/>

        {/* grid + left axis */}
        {Array.from({length: GRIDS + 1}, (_,i) => {
          const pct = i / GRIDS
          const y = PAD.t + chartH * (1 - pct)
          const val = Math.round(niceL * pct)
          return (
            <g key={i}>
              <line x1={PAD.l} y1={y} x2={PAD.l + chartW} y2={y}
                stroke={i === 0 ? '#d1d5db' : '#e5e7eb'} strokeWidth={i===0?1.5:1}
                strokeDasharray={i > 0 ? '4,3' : undefined}/>
              <text x={PAD.l - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
                {val >= 1000 ? `${(val/1000).toFixed(val%1000===0?0:1)}k` : val}
              </text>
            </g>
          )
        })}

        {/* right axis (comp) */}
        {Array.from({length: GRIDS + 1}, (_,i) => {
          const pct = i / GRIDS
          const y = PAD.t + chartH * (1 - pct)
          const val = Math.round(niceR * pct)
          return (
            <text key={i} x={PAD.l + chartW + 8} y={y + 4} textAnchor="start" fontSize="10" fill="#6ee7b7">
              {val >= 1000 ? `${(val/1000).toFixed(val%1000===0?0:1)}k` : val}
            </text>
          )
        })}

        {/* right axis label */}
        <text x={PAD.l + chartW + PAD.r - 4} y={PAD.t - 10} textAnchor="end" fontSize="9" fill="#10b981" fontWeight="600">ชดเชย (รายการ)</text>

        {/* year separators */}
        {data.map((d, i) => {
          if (i === 0) return null
          const pY = data[i-1].label.split('/')[0], tY = d.label.split('/')[0]
          if (pY === tY) return null
          const x = PAD.l + slotW * i
          return (
            <g key={`yr-${i}`}>
              <line x1={x} y1={PAD.t} x2={x} y2={PAD.t+chartH} stroke="#9ca3af" strokeWidth="1" strokeDasharray="5,3"/>
              <rect x={x+3} y={PAD.t+2} width={38} height={14} rx="3" fill="#f3f4f6"/>
              <text x={x+22} y={PAD.t+13} textAnchor="middle" fontSize="9.5" fill="#6b7280" fontWeight="700">ปี {tY}</text>
            </g>
          )
        })}

        {/* bars (clipped) */}
        <g clipPath="url(#chartClip)">
          {data.map((d, i) => {
            const cx = PAD.l + slotW * i + slotW / 2
            const hB = Math.max(0, (d.b / niceL) * chartH)
            const hC = Math.max(0, (d.c / niceL) * chartH)
            const isHov = hov === i
            const fade = hov !== null && !isHov
            return (
              <g key={d.label} opacity={fade ? 0.35 : 1} style={{transition:'opacity .15s'}}
                onMouseEnter={() => setHov(i)}>
                {isHov && <rect x={PAD.l + slotW*i} y={PAD.t} width={slotW} height={chartH} fill="#eff6ff" opacity="0.7"/>}
                <rect x={cx - bw - 1.5} y={PAD.t+chartH-hB} width={bw} height={hB} fill="url(#gb)" rx="3" filter="url(#ds)"/>
                <rect x={cx + 1.5} y={PAD.t+chartH-hC} width={bw} height={hC} fill="url(#gc)" rx="3" filter="url(#ds)"/>
              </g>
            )
          })}
        </g>

        {/* comp area fill */}
        <polygon points={areaPoints} fill="url(#ga)" clipPath="url(#chartClip)"/>

        {/* comp polyline */}
        <polyline points={linePoints} fill="none" stroke="#10b981" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" clipPath="url(#chartClip)"/>

        {/* comp dots */}
        {data.map((d, i) => {
          const x = PAD.l + slotW * i + slotW / 2
          const y = PAD.t + chartH * (1 - d.comp / niceR)
          const isHov = hov === i
          return (
            <circle key={i} cx={x} cy={y}
              r={isHov ? 6 : d.comp > 0 ? 3.5 : 0}
              fill={isHov ? '#059669' : '#fff'} stroke="#10b981" strokeWidth="2"
              filter={isHov ? 'url(#ds2)' : undefined}
              style={{transition:'r .1s'}}
              onMouseEnter={() => setHov(i)}/>
          )
        })}

        {/* x-axis labels */}
        {data.map((d, i) => {
          const x = PAD.l + slotW * i + slotW / 2
          const mm = parseInt(d.label.split('/')[1])
          const yy = d.label.split('/')[0].slice(2)
          const isHov = hov === i
          return (
            <g key={`lbl-${i}`}>
              <text x={x} y={PAD.t+chartH+16} textAnchor="middle" fontSize="10.5"
                fill={isHov ? '#2563eb' : '#6b7280'} fontWeight={isHov ? '700' : '400'}>
                {MONTH_TH[mm]}
              </text>
              <text x={x} y={PAD.t+chartH+29} textAnchor="middle" fontSize="9" fill="#c9d1d9">
                {yy}
              </text>
            </g>
          )
        })}

        {/* first year label */}
        {data.length > 0 && (
          <g>
            <rect x={PAD.l+2} y={PAD.t+2} width={38} height={14} rx="3" fill="#f3f4f6"/>
            <text x={PAD.l+21} y={PAD.t+13} textAnchor="middle" fontSize="9.5" fill="#6b7280" fontWeight="700">
              ปี {data[0].label.split('/')[0]}
            </text>
          </g>
        )}

        {/* hover tooltip */}
        {hov !== null && (() => {
          const d = data[hov]
          const cx = PAD.l + slotW * hov + slotW / 2
          const total = d.b + d.c
          const tw = 148, th = 102
          const tx = Math.max(PAD.l, Math.min(cx - tw/2, W - PAD.r - tw))
          const ty = PAD.t - th - 12
          const mm = parseInt(d.label.split('/')[1])
          return (
            <g>
              <rect x={tx} y={ty} width={tw} height={th} rx="10" fill="white"
                stroke="#e5e7eb" strokeWidth="1.5" filter="url(#ds2)"/>
              {/* header */}
              <rect x={tx} y={ty} width={tw} height={26} rx="10" fill="#1e40af"/>
              <rect x={tx} y={ty+16} width={tw} height={10} fill="#1e40af"/>
              <text x={tx+tw/2} y={ty+17} textAnchor="middle" fontSize="11" fontWeight="700" fill="white">
                {MONTH_TH[mm]} {d.label.split('/')[0]}
              </text>
              {/* rows */}
              <rect x={tx+10} y={ty+33} width="8" height="8" fill="url(#gb)" rx="1.5"/>
              <text x={tx+22} y={ty+41} fontSize="10" fill="#374151">ตับอักเสบ บี</text>
              <text x={tx+tw-10} y={ty+41} textAnchor="end" fontSize="10" fontWeight="700" fill="#1d4ed8">{d.b.toLocaleString()}</text>

              <rect x={tx+10} y={ty+48} width="8" height="8" fill="url(#gc)" rx="1.5"/>
              <text x={tx+22} y={ty+56} fontSize="10" fill="#374151">ตับอักเสบ ซี</text>
              <text x={tx+tw-10} y={ty+56} textAnchor="end" fontSize="10" fontWeight="700" fill="#0891b2">{d.c.toLocaleString()}</text>

              <line x1={tx+10} y1={ty+63} x2={tx+tw-10} y2={ty+63} stroke="#f3f4f6" strokeWidth="1"/>

              <circle cx={tx+14} cy={ty+73} r="4" fill="none" stroke="#10b981" strokeWidth="2"/>
              <text x={tx+22} y={ty+77} fontSize="10" fill="#374151">ชดเชย (ส่งข้อมูล)</text>
              <text x={tx+tw-10} y={ty+77} textAnchor="end" fontSize="10" fontWeight="700" fill="#059669">{d.comp.toLocaleString()}</text>

              <text x={tx+10} y={ty+92} fontSize="9" fill="#9ca3af">บริการรวม {total.toLocaleString()} รายการ</text>
              {d.amount > 0 && <text x={tx+tw-10} y={ty+92} textAnchor="end" fontSize="9" fill="#6ee7b7">฿{(d.amount).toLocaleString()}</text>}
            </g>
          )
        })()}

        {/* legend */}
        <g transform={`translate(${PAD.l}, 8)`}>
          <rect x="0" y="1" width="10" height="10" fill="url(#gb)" rx="2"/>
          <text x="14" y="10" fontSize="10" fill="#4b5563">ตับอักเสบ บี</text>
          <rect x="82" y="1" width="10" height="10" fill="url(#gc)" rx="2"/>
          <text x="96" y="10" fontSize="10" fill="#4b5563">ตับอักเสบ ซี</text>
          <line x1="172" y1="6" x2="186" y2="6" stroke="#10b981" strokeWidth="2.5"/>
          <circle cx="179" cy="6" r="3" fill="white" stroke="#10b981" strokeWidth="2"/>
          <text x="190" y="10" fontSize="10" fill="#4b5563">ชดเชย ตาม</text>
          <text x="190" y="21" fontSize="9" fill="#9ca3af">วันส่งข้อมูล สปสช.</text>
        </g>
      </svg>
    </div>
  )
}

// ── Donut Chart ────────────────────────────────────────────────────
function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((a,b) => a + b.value, 0)
  if (!total) return <div className="text-center text-gray-300 py-4 text-xs">ไม่มีข้อมูล</div>
  const R = 44, cx = 56, cy = 56, r = 24
  let angle = -Math.PI / 2
  const paths = slices.map(s => {
    const pct = s.value / total
    const startA = angle; angle += pct * Math.PI * 2
    const x1 = cx + R * Math.cos(startA); const y1 = cy + R * Math.sin(startA)
    const x2 = cx + R * Math.cos(angle); const y2 = cy + R * Math.sin(angle)
    const large = pct > 0.5 ? 1 : 0
    return { ...s, d: `M${cx},${cy} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`, pct }
  })
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 112 112" style={{width:80,height:80,flexShrink:0}}>
        {paths.map((p,i) => <path key={i} d={p.d} fill={p.color} opacity="0.9"/>)}
        <circle cx={cx} cy={cy} r={r} fill="white"/>
        <text x={cx} y={cy+4} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#374151">{fmtNum(total)}</text>
      </svg>
      <div className="space-y-1 flex-1 min-w-0">
        {paths.map((p,i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10.5px]">
            <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background:p.color}}/>
            <span className="text-gray-600 truncate flex-1">{p.label}</span>
            <span className="font-bold text-gray-700 flex-shrink-0">{(p.pct*100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────
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

// ── Main Component ─────────────────────────────────────────────────
export function SeamlessPage() {
  const [rows, setRows]           = useState<SeamlessRow[]>([])
  const [dbLoading, setDbLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importProgress, setIP]   = useState('')
  const [dragOver, setDragOver]   = useState(false)
  const [search, setSearch]       = useState('')
  const [filterStatus, setFStatus]= useState('all')
  const [filterType, setFType]    = useState('all')
  const [filterHsend, setFHsend]  = useState<string[]>([])
  const [filterRights, setFRights]= useState<string[]>([])
  const [filterYear, setFYear]    = useState('all')
  const [filterMonth, setFMonth]  = useState('all')
  const [page, setPage]           = useState(1)
  const [toast, setToast]         = useState<{msg:string;ok:boolean}|null>(null)
  const [confirmClear, setConfirm]= useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const PG = 50

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 5000)
  }, [])

  useEffect(() => {
    fetch('/api/seamless').then(r => r.json())
      .then(j => { if (j.ok) setRows(j.data); else showToast(j.error, false) })
      .catch(e => showToast(String(e), false))
      .finally(() => setDbLoading(false))
  }, [showToast])

  const processFiles = useCallback(async (files: File[]) => {
    const valid = files.filter(f => /\.(xlsx|xls)$/i.test(f.name))
    if (!valid.length) { showToast('กรุณาเลือกไฟล์ .xlsx เท่านั้น', false); return }
    setImporting(true)
    let totalNew = 0, totalSkip = 0
    for (const f of valid) {
      setIP(`กำลัง parse: ${f.name}`)
      const { rows: parsed, error } = await parseSeamlessXlsx(f)
      if (error) { showToast(`อ่านไฟล์ไม่สำเร็จ: ${error}`, false); continue }
      if (!parsed.length) { showToast(`ไม่พบข้อมูลในไฟล์ ${f.name}`, false); continue }
      const BATCH = 500
      const batches = Math.ceil(parsed.length / BATCH)
      let batchOk = true
      for (let b = 0; b < batches; b++) {
        const chunk = parsed.slice(b * BATCH, (b + 1) * BATCH)
        setIP(`กำลังบันทึก batch ${b+1}/${batches} (${fmtNum(chunk.length)} รายการ)...`)
        try {
          const j = await fetch('/api/seamless', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: chunk }) }).then(r => r.json())
          if (j.ok) {
            totalNew += j.imported ?? 0; totalSkip += chunk.length - (j.imported ?? 0)
            setRows(prev => { const ex = new Set(prev.map(r => `${r.trans_id}|${r.item_seq}`)); return [...prev, ...chunk.filter(r => !ex.has(`${r.trans_id}|${r.item_seq}`))] })
          } else { showToast(`บันทึก batch ${b+1} ไม่สำเร็จ: ${j.error}`, false); batchOk = false; break }
        } catch (e) { showToast(String(e), false); batchOk = false; break }
      }
      if (!batchOk) continue
    }
    showToast(totalNew > 0 ? `✓ เพิ่มใหม่ ${fmtNum(totalNew)} · ข้ามซ้ำ ${fmtNum(totalSkip)} รายการ` : `ไม่มีข้อมูลใหม่ (ซ้ำ ${fmtNum(totalSkip)})`, totalNew > 0)
    setPage(1); setIP(''); setImporting(false)
  }, [showToast])

  const handleInput  = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) processFiles(files) }, [processFiles])
  const handleDrop   = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); processFiles(Array.from(e.dataTransfer.files)) }, [processFiles])

  const handleClearAll = useCallback(async () => {
    setConfirm(false); setImporting(true); setIP('กำลังล้างข้อมูล...')
    const j = await fetch('/api/seamless', { method: 'DELETE' }).then(r => r.json())
    if (j.ok) { setRows([]); setPage(1); showToast('✓ ล้างข้อมูลเรียบร้อย', true) } else showToast(j.error, false)
    setIP(''); setImporting(false)
  }, [showToast])

  // ── Computed ───────────────────────────────────────────────────
  const hepRows = useMemo(() => rows.filter(r => isHepB(r.service_name) || isHepC(r.service_name)), [rows])

  // options สำหรับ filter dropdowns
  const filterOptions = useMemo(() => {
    const years   = [...new Set(hepRows.map(r => parseDateParts(r.service_date)?.year).filter(Boolean))].sort() as string[]
    const hsends  = [...new Set(hepRows.map(r => r.hsend || r.hmain || '').filter(Boolean))].sort()
    const rights  = [...new Set(hepRows.map(r => r.rights).filter(Boolean))].sort()
    const sources = [...new Set(rows.map(r => r.source_file))]
    return { years, hsends, rights, sources }
  }, [hepRows, rows])

  // กรองตาม HSEND, สิทธิ, ปี, เดือน
  const hepRowsFiltered = useMemo(() => {
    let r = hepRows
    if (filterHsend.length  > 0) r = r.filter(x => filterHsend.includes(x.hsend || x.hmain || ''))
    if (filterRights.length > 0) r = r.filter(x => filterRights.includes(x.rights))
    if (filterYear !== 'all')    r = r.filter(x => parseDateParts(x.service_date)?.year === filterYear)
    if (filterMonth !== 'all')   r = r.filter(x => parseDateParts(x.service_date)?.month === filterMonth)
    return r
  }, [hepRows, filterHsend, filterRights, filterYear, filterMonth])

  // stats (เปลี่ยนตาม filter ทั้งหมด)
  const stats = useMemo(() => {
    const hepB   = hepRowsFiltered.filter(r => isHepB(r.service_name))
    const hepC   = hepRowsFiltered.filter(r => isHepC(r.service_name))
    const comp   = hepRowsFiltered.filter(r => r.status === 'ชดเชย')
    const notComp= hepRowsFiltered.filter(r => r.status === 'ไม่ชดเชย')
    const reasonMap: Record<string,number> = {}
    for (const r of notComp) {
      const key = getReasonLabel(r.note, r.note_other)
      reasonMap[key] = (reasonMap[key] || 0) + 1
    }
    const reasons = Object.entries(reasonMap).sort((a,b) => b[1]-a[1]).slice(0,5)
    return {
      total: hepRowsFiltered.length, hepB: hepB.length, hepC: hepC.length,
      comp: comp.length, notComp: notComp.length,
      totalComp: comp.reduce((a,b) => a + b.compensated, 0),
      totalClaim: hepRowsFiltered.reduce((a,b) => a + b.total_claim, 0),
      uniqueB: new Set(hepB.map(r => r.pid)).size,
      uniqueC: new Set(hepC.map(r => r.pid)).size,
      reasons,
    }
  }, [hepRowsFiltered])

  // แนวโน้มรายเดือน
  // บริการ → จัดตาม service_date | ชดเชย → จัดตาม send_date (วันที่ สปสช. จ่ายจริง)
  const monthlyData = useMemo(() => {
    const svc: Record<string,{b:number;c:number}> = {}
    const pay: Record<string,{comp:number;amount:number}> = {}
    for (const r of hepRowsFiltered) {
      const ds = parseDateParts(r.service_date)
      if (ds) {
        const k = `${ds.year}/${ds.month}`
        if (!svc[k]) svc[k] = {b:0,c:0}
        if (isHepB(r.service_name)) svc[k].b++
        else svc[k].c++
      }
      if (r.status === 'ชดเชย') {
        const dp = parseDateParts(r.send_date)
        if (dp) {
          const k = `${dp.year}/${dp.month}`
          if (!pay[k]) pay[k] = {comp:0,amount:0}
          pay[k].comp++
          pay[k].amount += r.compensated
        }
      }
    }
    const allMonths = [...new Set([...Object.keys(svc), ...Object.keys(pay)])].sort()
    return allMonths.map(label => ({
      label,
      b: svc[label]?.b ?? 0,
      c: svc[label]?.c ?? 0,
      comp: pay[label]?.comp ?? 0,
      amount: pay[label]?.amount ?? 0,
    }))
  }, [hepRowsFiltered])

  // สิทธิ breakdown
  const rightsData = useMemo(() => {
    const m: Record<string,number> = {}
    for (const r of hepRowsFiltered) m[r.rights] = (m[r.rights]||0) + 1
    return Object.entries(m).sort((a,b) => b[1]-a[1])
  }, [hepRowsFiltered])

  // ตาราง: กรอง filterType + filterStatus + search
  const filtered = useMemo(() => {
    let r = filterType === 'hepB' ? hepRowsFiltered.filter(x => isHepB(x.service_name))
          : filterType === 'hepC' ? hepRowsFiltered.filter(x => isHepC(x.service_name))
          : hepRowsFiltered
    if (filterStatus !== 'all') r = r.filter(x => x.status === filterStatus)
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(x => x.name.toLowerCase().includes(q) || x.pid.includes(q) || x.rep_no.toLowerCase().includes(q)) }
    return r
  }, [hepRowsFiltered, filterType, filterStatus, search])

  const totalPages = Math.ceil(filtered.length / PG)
  const pageRows   = filtered.slice((page-1)*PG, page*PG)

  const hasFilter = filterHsend.length > 0 || filterRights.length > 0 || filterYear !== 'all' || filterMonth !== 'all'
  const clearAllFilters = () => { setFHsend([]); setFRights([]); setFYear('all'); setFMonth('all'); setPage(1) }

  // ── Loading ──────────────────────────────────────────────────
  if (dbLoading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin"/>
      <div className="text-[13px] text-gray-500">กำลังโหลดข้อมูลจาก Supabase...</div>
    </div>
  )

  // ── Empty state ──────────────────────────────────────────────
  if (rows.length === 0) return (
    <div className="max-w-[820px] mx-auto px-8 py-12">
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleInput}/>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-600"/>Seamless For DMIS — สปสช.
        </div>
        <h1 className="text-[24px] font-black text-gray-900 leading-tight mb-2">ติดตามข้อมูลการจ่ายชดเชย<br/><span className="text-blue-600">โรคเฉพาะ (REP Individual)</span></h1>
        <p className="text-[13px] text-gray-500">ข้อมูลจะบันทึกลง Supabase — เปิดใหม่ข้อมูลยังคงอยู่</p>
      </div>
      {importing ? (
        <div className="border-2 border-blue-200 bg-blue-50/60 rounded-2xl p-14 flex flex-col items-center gap-4">
          <span className="w-10 h-10 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
          <div className="text-[14px] font-bold text-gray-800">กำลังดำเนินการ...</div>
          <div className="text-[12.5px] text-blue-600">{importProgress}</div>
        </div>
      ) : (
        <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={e=>{e.preventDefault();setDragOver(false)}} onDrop={handleDrop}
          className={cn('border-2 border-dashed rounded-2xl transition-all p-14 flex flex-col items-center gap-5', dragOver?'border-blue-500 bg-blue-50/60':'border-gray-200 bg-gray-50/40 hover:border-blue-300')}>
          <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center text-3xl', dragOver?'bg-blue-100':'bg-gray-100')}>{dragOver?'📂':'📊'}</div>
          <div className="text-center">
            <div className="text-[15px] font-bold text-gray-800 mb-1">{dragOver?'วางไฟล์ได้เลย':'ลากไฟล์มาวางที่นี่'}</div>
            <div className="text-[12.5px] text-gray-400 mb-4">รองรับหลายไฟล์พร้อมกัน (.xlsx / .xls)</div>
            <button type="button" onClick={()=>inputRef.current?.click()} className="px-6 py-2.5 text-[13px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-sm">เลือกไฟล์จากเครื่อง</button>
          </div>
          <div className="text-[11.5px] text-gray-500 bg-white border border-gray-200 rounded-xl px-5 py-3.5 text-left max-w-[400px] w-full">
            <div className="font-bold text-gray-700 mb-2">วิธีดาวน์โหลดไฟล์จาก Seamless:</div>
            <ol className="space-y-1 list-decimal list-inside text-gray-400">
              <li>ไปที่ seamlessfordmis.nhso.go.th</li>
              <li>เมนู REP → รายงาน REP แบบ INDIVIDUAL</li>
              <li>เลือก Krungthai Digital Health Platform</li>
              <li>กด ออกรายงาน → ออกรายงาน (Excel)</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  )

  // ── Main Dashboard ───────────────────────────────────────────
  const DONUT_REASONS = stats.reasons.map(([label, val], i) => ({
    label: label.length > 30 ? label.slice(0,30)+'…' : label,
    value: val,
    color: ['#ef4444','#f97316','#eab308','#8b5cf6','#6b7280'][i] ?? '#9ca3af',
  }))
  const DONUT_RIGHTS = rightsData.slice(0,5).map(([key, val], i) => ({
    label: RIGHTS_LABEL[key] ?? key,
    value: val,
    color: ['#2563eb','#059669','#f59e0b','#8b5cf6','#06b6d4'][i] ?? '#9ca3af',
  }))

  return (
    <div className="max-w-[1440px] mx-auto px-8 py-7">
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleInput}/>

      {/* Toast */}
      {toast && (
        <div className={cn('fixed bottom-7 right-7 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl border text-sm shadow-xl',
          toast.ok?'bg-emerald-50 border-emerald-200 text-emerald-800':'bg-red-50 border-red-200 text-red-800')}>
          <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0', toast.ok?'bg-emerald-500':'bg-red-500')}>{toast.ok?'✓':'✕'}</span>
          {toast.msg}
        </div>
      )}

      {/* Importing overlay */}
      {importing && (
        <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm z-[998] flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-4 min-w-[320px]">
            <span className="w-10 h-10 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
            <div className="text-[14px] font-bold text-gray-800">กำลังดำเนินการ</div>
            <div className="text-[12px] text-blue-600 text-center max-w-[260px]">{importProgress}</div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmClear && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-6" onClick={()=>setConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] p-7" onClick={e=>e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="w-6 h-6"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
            </div>
            <div className="text-center mb-5">
              <div className="text-[16px] font-bold text-gray-900 mb-1">ยืนยันการล้างข้อมูล</div>
              <div className="text-[13px] text-gray-500">จะลบทั้งหมด <b>{fmtNum(rows.length)}</b> รายการ ออกจาก Supabase</div>
              <div className="text-[11px] text-red-500 mt-2">⚠ ไม่สามารถยกเลิกได้</div>
            </div>
            <div className="flex gap-2 justify-center">
              <button onClick={()=>setConfirm(false)} className="px-5 py-2 text-[12.5px] font-semibold border border-gray-200 rounded-lg text-gray-500">ยกเลิก</button>
              <button onClick={handleClearAll} className="px-5 py-2 text-[12.5px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg">ล้างข้อมูล</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"/>Seamless For DMIS · Supabase
          </div>
          <h1 className="text-[20px] font-black text-gray-900">ติดตามการจ่ายชดเชยไวรัสตับอักเสบ บี &amp; ซี</h1>
          <div className="text-[12px] text-gray-400 mt-0.5">
            {fmtNum(rows.length)} รายการทั้งหมด · กรองแล้ว {fmtNum(hepRowsFiltered.length)} รายการ{filterOptions.sources.length > 0 ? ` · ${filterOptions.sources.length} ไฟล์` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={()=>inputRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold bg-blue-50 border border-blue-200 text-blue-600 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-40">
            + เพิ่มไฟล์ .xlsx
          </button>
          <button type="button" onClick={()=>setConfirm(true)} disabled={importing}
            className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold bg-gray-50 border border-gray-200 text-gray-500 rounded-xl hover:border-red-200 hover:text-red-500 transition-all disabled:opacity-40">
            🗑 ล้างทั้งหมด
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 mb-5 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">กรองข้อมูล:</span>

          {/* ปี */}
          <select value={filterYear} onChange={e=>{setFYear(e.target.value);setPage(1)}}
            className="pl-3 pr-7 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 cursor-pointer appearance-none">
            <option value="all">ทุกปี</option>
            {filterOptions.years.map(y => <option key={y} value={y}>ปี {y}</option>)}
          </select>

          {/* เดือน */}
          <select value={filterMonth} onChange={e=>{setFMonth(e.target.value);setPage(1)}}
            className="pl-3 pr-7 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 cursor-pointer appearance-none">
            <option value="all">ทุกเดือน</option>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={String(m).padStart(2,'0')}>{MONTH_TH[m]}</option>)}
          </select>

          {/* HSEND */}
          <select value="" onChange={e=>{if(!e.target.value)return;setFHsend(p=>p.includes(e.target.value)?p.filter(v=>v!==e.target.value):[...p,e.target.value]);setPage(1)}}
            className="pl-3 pr-7 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 cursor-pointer appearance-none">
            <option value="">หน่วยบริการ (HSEND){filterHsend.length>0?` ✓${filterHsend.length}`:''}</option>
            {filterOptions.hsends.map(h=><option key={h} value={h}>{filterHsend.includes(h)?'✓ ':''}{h}</option>)}
          </select>

          {/* สิทธิ */}
          <select value="" onChange={e=>{if(!e.target.value)return;setFRights(p=>p.includes(e.target.value)?p.filter(v=>v!==e.target.value):[...p,e.target.value]);setPage(1)}}
            className="pl-3 pr-7 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-400 cursor-pointer appearance-none">
            <option value="">สิทธิการรักษา{filterRights.length>0?` ✓${filterRights.length}`:''}</option>
            {filterOptions.rights.map(r=><option key={r} value={r}>{filterRights.includes(r)?'✓ ':''}{RIGHTS_LABEL[r]??r}</option>)}
          </select>

          {hasFilter && (
            <button type="button" onClick={clearAllFilters}
              className="px-3 py-1.5 text-[11.5px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-all">
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {hasFilter && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {filterYear !== 'all' && <Chip label={`ปี ${filterYear}`} onRemove={()=>{setFYear('all');setPage(1)}} color="purple"/>}
            {filterMonth !== 'all' && <Chip label={`เดือน ${MONTH_TH[parseInt(filterMonth)]}`} onRemove={()=>{setFMonth('all');setPage(1)}} color="purple"/>}
            {filterHsend.map(h=><Chip key={h} label={`HSEND: ${h}`} onRemove={()=>{setFHsend(p=>p.filter(v=>v!==h));setPage(1)}} color="blue"/>)}
            {filterRights.map(r=><Chip key={r} label={RIGHTS_LABEL[r]??r} onRemove={()=>{setFRights(p=>p.filter(v=>v!==r));setPage(1)}} color="green"/>)}
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard icon="🔬" label="บริการตับอักเสบ บี" val={fmtNum(stats.hepB)} sub={`${fmtNum(stats.uniqueB)} คน`} barColor="#2563eb" bar={stats.total?stats.hepB/stats.total:0}/>
        <KpiCard icon="🧬" label="บริการตับอักเสบ ซี" val={fmtNum(stats.hepC)} sub={`${fmtNum(stats.uniqueC)} คน`} barColor="#0891b2" bar={stats.total?stats.hepC/stats.total:0}/>
        <KpiCard icon="✅" label="ได้รับการชดเชย" val={`${fmtNum(stats.comp)} รายการ`} sub={`${stats.total?(stats.comp/stats.total*100).toFixed(1):0}%`} sub2={`฿${fmtBaht(stats.totalComp)}`} barColor="#059669" bar={stats.total?stats.comp/stats.total:0}/>
        <KpiCard icon="❌" label="ไม่ได้รับการชดเชย" val={`${fmtNum(stats.notComp)} รายการ`} sub={`฿${fmtBaht(stats.totalClaim - stats.totalComp)}`} barColor="#dc2626" bar={stats.total?stats.notComp/stats.total:0}/>
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {/* Monthly trend */}
        <div className="col-span-2 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-indigo-500"/><span className="font-bold text-gray-900 text-[13.5px]">แนวโน้มรายเดือน</span>
            <span className="ml-auto text-[11px] text-gray-400">{monthlyData.length} เดือน</span>
          </div>
          {monthlyData.length > 0 ? <MiniBarChart data={monthlyData}/> : <div className="text-center text-gray-300 py-10 text-xs">ไม่มีข้อมูล</div>}
        </div>

        {/* B vs C + สิทธิ */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-cyan-500"/><span className="font-bold text-gray-900 text-[13px]">บี vs ซี</span>
            </div>
            <DonutChart slices={[
              {label:`ตับอักเสบ บี (${fmtNum(stats.hepB)})`, value:stats.hepB, color:'#2563eb'},
              {label:`ตับอักเสบ ซี (${fmtNum(stats.hepC)})`, value:stats.hepC, color:'#0891b2'},
            ]}/>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-amber-500"/><span className="font-bold text-gray-900 text-[13px]">สิทธิการรักษา</span>
            </div>
            <DonutChart slices={DONUT_RIGHTS}/>
          </div>
        </div>
      </div>

      {/* ── Summary + Not-comp reasons ── */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <SummaryCard title="ตับอักเสบ บี" rows={hepRowsFiltered.filter(r=>isHepB(r.service_name))} color="#2563eb" bgColor="#eff6ff"/>
        <SummaryCard title="ตับอักเสบ ซี" rows={hepRowsFiltered.filter(r=>isHepC(r.service_name))} color="#0891b2" bgColor="#ecfeff"/>
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-red-500"/><span className="font-bold text-gray-900 text-[13px]">สาเหตุไม่ชดเชย ({fmtNum(stats.notComp)} รายการ)</span>
          </div>
          <DonutChart slices={DONUT_REASONS}/>
          <div className="mt-3 space-y-1.5">
            {stats.reasons.map(([label, val], i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-sm mt-1 flex-shrink-0" style={{background:['#ef4444','#f97316','#eab308','#8b5cf6','#6b7280'][i]}}/>
                <span className="text-[11px] text-gray-600 flex-1 leading-tight">{label}</span>
                <span className="text-[11px] font-bold text-gray-500 flex-shrink-0">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-indigo-500"/>
            <div className="font-bold text-gray-900 text-[13.5px]">รายการบริการตับอักเสบ</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {[['all','ทั้งหมด'],['hepB','ตับอักเสบ บี'],['hepC','ตับอักเสบ ซี']].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>{setFType(v);setPage(1)}} className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',filterType===v?'bg-white font-bold text-blue-600 shadow-sm':'text-gray-500 hover:text-blue-500')}>{l}</button>
              ))}
            </div>
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {[['all','ทั้งหมด'],['ชดเชย','ชดเชย'],['ไม่ชดเชย','ไม่ชดเชย']].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>{setFStatus(v);setPage(1)}} className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',filterStatus===v?'bg-white font-bold text-blue-600 shadow-sm':'text-gray-500 hover:text-blue-500')}>{l}</button>
              ))}
            </div>
            <div className="relative">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"><circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/></svg>
              <input className="pl-9 pr-3 py-2 text-[12.5px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-[200px]"
                placeholder="ค้นหาชื่อ, PID, REP No..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
            </div>
            <button type="button" onClick={()=>exportCsv(filtered)} className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3"><path d="M8 2v8M5 7l3 3 3-3M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1"/></svg>Export CSV
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-[12px]">
          <StatChip dot="#6b7280" label="แสดง" val={fmtNum(filtered.length)} unit="รายการ"/>
          <div className="w-px bg-gray-200 self-stretch"/>
          <StatChip dot="#059669" label="ชดเชยรวม" val={`฿${fmtBaht(filtered.filter(r=>r.status==='ชดเชย').reduce((a,b)=>a+b.compensated,0))}`} unit=""/>
          <div className="w-px bg-gray-200 self-stretch"/>
          <StatChip dot="#dc2626" label="ไม่ชดเชย" val={fmtNum(filtered.filter(r=>r.status==='ไม่ชดเชย').length)} unit="รายการ"/>
          <div className="w-px bg-gray-200 self-stretch"/>
          <StatChip dot="#2563eb" label="ขอเบิกรวม" val={`฿${fmtBaht(filtered.reduce((a,b)=>a+b.total_claim,0))}`} unit=""/>
        </div>

        <div className="overflow-x-auto overflow-y-auto" style={{maxHeight:'60vh'}}>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b-2 border-gray-100">
              <tr>{['#','REP No.','ชื่อ-สกุล','PID','สิทธิ','วันที่บริการ','วันที่ส่ง','รายการบริการ','ขอเบิก (฿)','ชดเชย (฿)','สถานะ','หมายเหตุ'].map(h=>(
                <th key={h} className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-16 text-gray-400"><div className="text-3xl mb-3 opacity-40">🔍</div><div className="text-[13px]">ไม่พบข้อมูล</div></td></tr>
              ) : pageRows.map((r,i) => {
                const reason = getReasonLabel(r.note, r.note_other)
                return (
                  <tr key={r.id??`${r.trans_id}-${r.item_seq}-${i}`} className="border-b border-gray-100 hover:bg-blue-50/50 transition-all even:bg-gray-50/30">
                    <td className="px-3 py-2.5 text-gray-400 font-mono text-[11px]">{(page-1)*PG+i+1}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600 whitespace-nowrap">{r.rep_no}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{r.pid}</td>
                    <td className="px-3 py-2.5"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',r.rights==='UCS'?'bg-blue-100 text-blue-700':r.rights==='SSS'?'bg-orange-100 text-orange-700':r.rights==='WEL'?'bg-purple-100 text-purple-700':r.rights==='OFC'?'bg-yellow-100 text-yellow-700':'bg-gray-100 text-gray-600')}>{r.rights||'—'}</span></td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.service_date}</td>
                    <td className="px-3 py-2.5 text-gray-400 text-[11px] whitespace-nowrap">{r.send_date}</td>
                    <td className="px-3 py-2.5"><span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold',isHepB(r.service_name)?'bg-blue-50 text-blue-700 border border-blue-200':isHepC(r.service_name)?'bg-cyan-50 text-cyan-700 border border-cyan-200':'bg-gray-50 text-gray-600')}>{isHepB(r.service_name)?'🟦':isHepC(r.service_name)?'🔵':''}<span className="truncate max-w-[220px]">{r.service_name}</span></span></td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold text-gray-700">{r.total_claim>0?fmtBaht(r.total_claim):'—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold"><span className={r.compensated>0?'text-emerald-600':'text-gray-300'}>{r.compensated>0?fmtBaht(r.compensated):'—'}</span></td>
                    <td className="px-3 py-2.5 text-center"><span className={cn('px-2.5 py-1 rounded-full text-[10.5px] font-bold',r.status==='ชดเชย'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600')}>{r.status==='ชดเชย'?'✓ ชดเชย':'✕ ไม่ชดเชย'}</span></td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-400 max-w-[200px]"><span className="truncate block" title={reason}>{reason==='ไม่ระบุ'?'—':reason}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 px-6 py-4 border-t border-gray-100 flex-wrap">
            <button type="button" disabled={page===1} onClick={()=>setPage(p=>p-1)} className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400 hover:text-blue-600 transition-all">‹</button>
            {Array.from({length:Math.min(totalPages,10)},(_,i)=>{const p=totalPages<=10?i+1:Math.max(1,Math.min(page-4,totalPages-9))+i;return <button key={p} type="button" onClick={()=>setPage(p)} className={cn('px-3 py-1.5 text-[12px] border rounded-lg transition-all',p===page?'bg-blue-600 border-blue-600 text-white font-semibold':'bg-white border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600')}>{p}</button>})}
            <button type="button" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400 hover:text-blue-600 transition-all">›</button>
            <span className="text-[12px] text-gray-400 ml-2">หน้า {page}/{totalPages} · {fmtNum(filtered.length)} รายการ</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub Components ─────────────────────────────────────────────────
function Chip({ label, onRemove, color }: { label:string; onRemove:()=>void; color:'blue'|'purple'|'green' }) {
  const cls = { blue:'bg-blue-100 text-blue-700 border-blue-200', purple:'bg-purple-100 text-purple-700 border-purple-200', green:'bg-green-100 text-green-700 border-green-200' }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border', cls[color])}>
      {label}
      <button type="button" onClick={onRemove} className="w-3.5 h-3.5 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-[9px] ml-0.5 transition-all">✕</button>
    </span>
  )
}

function SummaryCard({ title, rows, color, bgColor }: { title:string; rows:SeamlessRow[]; color:string; bgColor:string }) {
  const comp = rows.filter(r => r.status==='ชดเชย'), notComp = rows.filter(r => r.status==='ไม่ชดเชย')
  const pct = rows.length ? (comp.length/rows.length*100) : 0
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4"><div className="w-2 h-2 rounded-full" style={{background:color}}/><div className="font-bold text-gray-900 text-[13px]">{title}</div></div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center p-3 rounded-xl" style={{background:bgColor}}><div className="text-[18px] font-black" style={{color}}>{fmtNum(rows.length)}</div><div className="text-[10px] text-gray-500">ทั้งหมด</div></div>
        <div className="text-center p-3 rounded-xl bg-emerald-50"><div className="text-[18px] font-black text-emerald-600">{fmtNum(comp.length)}</div><div className="text-[10px] text-gray-500">ชดเชยแล้ว</div></div>
        <div className="text-center p-3 rounded-xl bg-red-50"><div className="text-[18px] font-black text-red-600">{fmtNum(notComp.length)}</div><div className="text-[10px] text-gray-500">ไม่ชดเชย</div></div>
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-[11.5px] mb-1"><span className="text-gray-500">อัตราชดเชย</span><span className="font-bold" style={{color}}>{pct.toFixed(1)}%</span></div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/></div>
      </div>
      <div className="text-[12px] font-bold" style={{color}}>ยอดชดเชยรวม: ฿{fmtBaht(comp.reduce((a,b)=>a+b.compensated,0))}</div>
    </div>
  )
}

function StatChip({ dot, label, val, unit }: { dot:string; label:string; val:string; unit:string }) {
  return <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:dot}}/><span className="text-gray-500">{label}</span><span className="font-bold text-gray-800">{val}</span>{unit&&<span className="text-gray-400">{unit}</span>}</div>
}

function exportCsv(rows: SeamlessRow[]) {
  const h = ['ลำดับ','REP No.','Trans ID','HN','PID','ชื่อ-สกุล','สิทธิ','หน่วยบริการ','วันที่ส่ง','วันที่บริการ','รายการบริการ','จำนวน','ราคา','ขอเบิกรวม','ชดเชย','ไม่ชดเชย','สถานะ','หมายเหตุ','ไฟล์']
  const d = rows.map((r,i) => [i+1,r.rep_no,r.trans_id,r.hn,r.pid,r.name,r.rights,r.hmain,r.send_date,r.service_date,r.service_name,r.qty,r.price,r.total_claim,r.compensated,r.not_comp,r.status,getReasonLabel(r.note,r.note_other),r.source_file].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))
  const b = new Blob(['\uFEFF'+[h.join(','),...d].join('\n')],{type:'text/csv;charset=utf-8;'})
  const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = `seamless_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(u)
}