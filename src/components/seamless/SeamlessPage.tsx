'use client'
import { useState, useMemo, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────
interface SeamlessRow {
  seq: string
  repNo: string
  transId: string
  hn: string
  pid: string
  name: string
  right: string
  hmain: string
  sendDate: string
  serviceDate: string
  itemSeq: string
  serviceName: string
  qty: number
  price: number
  ceiling: number
  totalClaim: number
  psCode: string
  psPct: number
  compensated: number
  notComp: number
  extra: number
  recall: number
  status: string
  note: string
  noteOther: string
  hsend: string
}

interface ParsedFile {
  filename: string
  printDate: string
  project: string
  rows: SeamlessRow[]
}

// ── Parser ────────────────────────────────────────────────────────
async function parseSeamlessXlsx(file: File): Promise<ParsedFile> {
  const XLSX = (await import('xlsx')).default
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as string[][]

  let printDate = '', project = ''
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    const r = raw[i].map(String)
    if (r.some(v => v.includes('วันที่จัดพิมพ์'))) printDate = r.find(v => /\d{2}\/\d{2}\/\d{4}/.test(v)) ?? ''
    if (r.some(v => v.includes('โครงการ'))) project = r[r.indexOf(r.find(v => v.includes('โครงการ')) ?? '') + 1] ?? ''
  }

  // Find data start (row with ลำดับที่ + REP No.)
  let dataStart = -1
  for (let i = 0; i < raw.length; i++) {
    const joined = raw[i].join('')
    if (joined.includes('ลำดับที่') && joined.includes('REP')) { dataStart = i + 3; break }
  }
  if (dataStart < 0) dataStart = 10

  const rows: SeamlessRow[] = []
  for (let i = dataStart; i < raw.length; i++) {
    const r = raw[i].map(v => String(v ?? '').trim())
    if (!r[0] && !r[1]) continue
    if (!r[1] && !r[2]) continue
    rows.push({
      seq: r[0], repNo: r[1], transId: r[2], hn: r[3],
      pid: r[5] || r[4] || '', name: r[6] || r[4] || '',
      right: r[7] || '', hmain: r[8] || '',
      sendDate: r[9] || '', serviceDate: r[10] || '',
      itemSeq: r[11] || '', serviceName: r[12] || '',
      qty: parseFloat(r[13]) || 0,
      price: parseFloat(r[14]) || 0,
      ceiling: parseFloat(r[15]) || 0,
      totalClaim: parseFloat(r[16]) || 0,
      psCode: r[17] || '',
      psPct: parseFloat(r[18]) || 0,
      compensated: parseFloat(r[19]) || 0,
      notComp: parseFloat(r[20]) || 0,
      extra: parseFloat(r[21]) || 0,
      recall: parseFloat(r[22]) || 0,
      status: r[23] || '',
      note: r[24] || '', noteOther: r[25] || '', hsend: r[26] || '',
    })
  }

  return { filename: file.name, printDate, project, rows }
}

// ── Helper ────────────────────────────────────────────────────────
const HEP_B = 'บริการตรวจคัดกรองไวรัสตับอักเสบ บี'
const HEP_C = 'การตรวจคัดกรองโรคไวรัสตับอักเสบ ซี'

const isHepB = (s: string) => s.includes('ไวรัสตับอักเสบ บี') || s.includes('ตับอักเสบบี') || s.includes('HBsAg')
const isHepC = (s: string) => s.includes('ไวรัสตับอักเสบ ซี') || s.includes('ตับอักเสบซี') || s.includes('Anti-HCV') || s.includes('anti hcv')

function fmtBaht(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}
function fmtNum(n: number) { return n.toLocaleString('th-TH') }

// ── Main Component ────────────────────────────────────────────────
export function SeamlessPage() {
  const [files, setFiles] = useState<ParsedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all') // all | hepB | hepC
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const PG = 50

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setLoading(true)
    const newParsed: ParsedFile[] = []
    for (const f of Array.from(fileList)) {
      if (!f.name.match(/\.(xlsx|xls)$/i)) continue
      try {
        const p = await parseSeamlessXlsx(f)
        newParsed.push(p)
      } catch (e) {
        showToast(`อ่านไฟล์ ${f.name} ไม่สำเร็จ: ${String(e)}`, false)
      }
    }
    setFiles(prev => [...prev, ...newParsed])
    setPage(1)
    if (newParsed.length) showToast(`✓ โหลด ${newParsed.length} ไฟล์ รวม ${newParsed.reduce((a, b) => a + b.rows.length, 0).toLocaleString()} รายการ`, true)
    setLoading(false)
  }, [showToast])

  // All rows from all files merged
  const allRows = useMemo(() => files.flatMap(f => f.rows), [files])

  // Filter: hepatitis only
  const hepRows = useMemo(() =>
    allRows.filter(r => isHepB(r.serviceName) || isHepC(r.serviceName)),
    [allRows])

  const filtered = useMemo(() => {
    let rows = filterType === 'hepB' ? hepRows.filter(r => isHepB(r.serviceName))
      : filterType === 'hepC' ? hepRows.filter(r => isHepC(r.serviceName))
      : hepRows

    if (filterStatus !== 'all') rows = rows.filter(r => r.status === filterStatus)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.pid.includes(q) ||
        r.repNo.toLowerCase().includes(q) ||
        r.transId.includes(q) ||
        r.serviceDate.includes(q)
      )
    }
    return rows
  }, [hepRows, filterType, filterStatus, search])

  // KPI stats
  const stats = useMemo(() => {
    const hepB = hepRows.filter(r => isHepB(r.serviceName))
    const hepC = hepRows.filter(r => isHepC(r.serviceName))
    const comp = hepRows.filter(r => r.status === 'ชดเชย')
    const notComp = hepRows.filter(r => r.status === 'ไม่ชดเชย')
    return {
      totalHep: hepRows.length,
      hepB: hepB.length, hepC: hepC.length,
      comp: comp.length, notComp: notComp.length,
      totalComp: comp.reduce((a, b) => a + b.compensated, 0),
      totalClaim: hepRows.reduce((a, b) => a + b.totalClaim, 0),
      totalNotComp: notComp.reduce((a, b) => a + b.totalClaim, 0),
      // unique persons
      uniquePersonsB: new Set(hepB.map(r => r.pid)).size,
      uniquePersonsC: new Set(hepC.map(r => r.pid)).size,
    }
  }, [hepRows])

  const totalPages = Math.ceil(filtered.length / PG)
  const pageRows = filtered.slice((page - 1) * PG, page * PG)

  // ── Render ──────────────────────────────────────────────────────
  if (!files.length) {
    return (
      <div className="max-w-[900px] mx-auto px-8 py-14">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            Seamless For DMIS — สปสช.
          </div>
          <h1 className="text-[28px] font-black text-gray-900 leading-tight mb-2">
            ติดตามข้อมูลการจ่ายชดเชย<br/>
            <span className="text-blue-600">โรคเฉพาะ (REP Individual)</span>
          </h1>
          <p className="text-[13.5px] text-gray-500 leading-relaxed max-w-[560px]">
            นำเข้าไฟล์ .xlsx จากระบบ Seamless For DMIS ของ สปสช. เพื่อดูสรุปการชดเชยบริการตรวจคัดกรองไวรัสตับอักเสบ บี และ ซี
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all',
            dragOver ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/30',
          )}>
          <div className={cn('w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-all',
            dragOver ? 'bg-blue-100' : 'bg-gray-100')}>
            📊
          </div>
          <div className="text-center">
            <div className="text-[16px] font-bold text-gray-800 mb-1">ลากไฟล์มาวางที่นี่</div>
            <div className="text-[13px] text-gray-400">หรือคลิกเพื่อเลือกไฟล์ .xlsx จาก Seamless</div>
          </div>
          <div className="text-[12px] text-gray-400 bg-white border border-gray-200 rounded-xl px-5 py-3 text-left max-w-[400px] w-full">
            <div className="font-bold text-gray-600 mb-1.5">วิธีดาวน์โหลดไฟล์จาก Seamless:</div>
            <ol className="space-y-1 list-decimal list-inside">
              <li>ไปที่ seamlessfordmis.nhso.go.th</li>
              <li>เลือกเมนู REP → รายงาน REP แบบ INDIVIDUAL</li>
              <li>เลือกโครงการ Krungthai Digital Health Platform</li>
              <li>กด ออกรายงาน → Export Excel</li>
            </ol>
          </div>
          {loading && <div className="text-[13px] text-blue-600 font-semibold flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            กำลังประมวลผล...
          </div>}
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </div>
    )
  }

  return (
    <div className="max-w-[1440px] mx-auto px-8 py-7">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-7 right-7 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl border text-sm shadow-xl animate-fade-up',
          toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800',
        )}>
          <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',
            toast.ok ? 'bg-emerald-500' : 'bg-red-500')}>{toast.ok ? '✓' : '✕'}</span>
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Seamless For DMIS
          </div>
          <h1 className="text-[20px] font-black text-gray-900">
            ติดตามการจ่ายชดเชยไวรัสตับอักเสบ บี &amp; ซี
          </h1>
          <div className="text-[12px] text-gray-400 mt-0.5">
            {files.length} ไฟล์ · {fmtNum(allRows.length)} รายการทั้งหมด · พบบริการตับอักเสบ {fmtNum(hepRows.length)} รายการ
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold bg-blue-50 border border-blue-200 text-blue-600 rounded-xl hover:bg-blue-100 transition-all">
            + เพิ่มไฟล์
          </button>
          <button
            onClick={() => { setFiles([]); setPage(1) }}
            className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold bg-gray-50 border border-gray-200 text-gray-500 rounded-xl hover:border-red-200 hover:text-red-500 transition-all">
            🗑 ล้างข้อมูล
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
            onChange={e => handleFiles(e.target.files)} />
        </div>
      </div>

      {/* Files loaded */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-[11.5px]">
              <span className="text-blue-500">📄</span>
              <span className="font-medium text-gray-700">{f.filename}</span>
              {f.printDate && <span className="text-gray-400">({f.printDate})</span>}
              <span className="text-gray-400">·</span>
              <span className="font-bold text-gray-600">{fmtNum(f.rows.length)} rows</span>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                className="w-4 h-4 rounded-full bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 transition-all flex items-center justify-center text-[10px]">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard
          icon="🔬" label="บริการตับอักเสบ บี" sub={`${fmtNum(stats.uniquePersonsB)} คน (ไม่ซ้ำ)`}
          val={fmtNum(stats.hepB)} color="#2563eb"
          bar={stats.totalHep ? stats.hepB / stats.totalHep : 0}
          barColor="#2563eb"
        />
        <KpiCard
          icon="🧬" label="บริการตับอักเสบ ซี" sub={`${fmtNum(stats.uniquePersonsC)} คน (ไม่ซ้ำ)`}
          val={fmtNum(stats.hepC)} color="#0891b2"
          bar={stats.totalHep ? stats.hepC / stats.totalHep : 0}
          barColor="#0891b2"
        />
        <KpiCard
          icon="✅" label="ได้รับการชดเชย" sub={`${stats.totalHep ? (stats.comp / stats.totalHep * 100).toFixed(1) : 0}% ของทั้งหมด`}
          val={`${fmtNum(stats.comp)} รายการ`} color="#059669"
          bar={stats.totalHep ? stats.comp / stats.totalHep : 0}
          barColor="#059669"
          sub2={`฿${fmtBaht(stats.totalComp)}`}
        />
        <KpiCard
          icon="❌" label="ไม่ได้รับการชดเชย" sub={`฿${fmtBaht(stats.totalNotComp)} ที่ขอเบิก`}
          val={`${fmtNum(stats.notComp)} รายการ`} color="#dc2626"
          bar={stats.totalHep ? stats.notComp / stats.totalHep : 0}
          barColor="#dc2626"
        />
      </div>

      {/* Summary by type */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <SummaryCard
          title="สรุปบริการตรวจคัดกรองไวรัสตับอักเสบ บี"
          rows={hepRows.filter(r => isHepB(r.serviceName))}
          color="#2563eb"
          bgColor="#eff6ff"
        />
        <SummaryCard
          title="สรุปบริการตรวจคัดกรองไวรัสตับอักเสบ ซี"
          rows={hepRows.filter(r => isHepC(r.serviceName))}
          color="#0891b2"
          bgColor="#ecfeff"
        />
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-4">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <div className="font-bold text-gray-900 text-[13.5px]">รายการบริการตับอักเสบทั้งหมด</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Type filter */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {[['all','ทั้งหมด'],['hepB','ตับอักเสบ บี'],['hepC','ตับอักเสบ ซี']].map(([v,l]) => (
                <button key={v} onClick={() => { setFilterType(v); setPage(1) }}
                  className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',
                    filterType === v ? 'bg-white font-bold text-blue-600 shadow-sm' : 'text-gray-500 hover:text-blue-500')}>
                  {l}
                </button>
              ))}
            </div>
            {/* Status filter */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {[['all','ทั้งหมด'],['ชดเชย','ชดเชย'],['ไม่ชดเชย','ไม่ชดเชย']].map(([v,l]) => (
                <button key={v} onClick={() => { setFilterStatus(v); setPage(1) }}
                  className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',
                    filterStatus === v ? 'bg-white font-bold text-blue-600 shadow-sm' : 'text-gray-500 hover:text-blue-500')}>
                  {l}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none">
                <circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/>
              </svg>
              <input
                className="pl-9 pr-3 py-2 text-[12.5px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 w-[220px]"
                placeholder="ค้นหาชื่อ, PID, REP No..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>
            <button onClick={() => exportCsv(filtered)} className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
                <path d="M8 2v8M5 7l3 3 3-3M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1"/>
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-[12px]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">แสดง</span>
            <span className="font-bold text-gray-800">{fmtNum(filtered.length)} รายการ</span>
          </div>
          <div className="w-px bg-gray-200 self-stretch" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-gray-500">ชดเชย</span>
            <span className="font-bold text-emerald-700">฿{fmtBaht(filtered.filter(r => r.status === 'ชดเชย').reduce((a, b) => a + b.compensated, 0))}</span>
          </div>
          <div className="w-px bg-gray-200 self-stretch" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-gray-500">ไม่ชดเชย</span>
            <span className="font-bold text-red-600">{fmtNum(filtered.filter(r => r.status === 'ไม่ชดเชย').length)} รายการ</span>
          </div>
          <div className="w-px bg-gray-200 self-stretch" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-gray-500">ขอเบิกรวม</span>
            <span className="font-bold text-blue-700">฿{fmtBaht(filtered.reduce((a, b) => a + b.totalClaim, 0))}</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '60vh' }}>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b-2 border-gray-100">
              <tr>
                {['#', 'REP No.', 'ชื่อ-สกุล', 'PID', 'สิทธิ', 'วันที่บริการ', 'วันที่ส่งข้อมูล', 'รายการ', 'ขอเบิก (฿)', 'ชดเชย (฿)', 'สถานะ', 'หมายเหตุ'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-16 text-gray-400">
                    <div className="text-3xl mb-3 opacity-40">🔍</div>
                    <div className="text-[13px] font-medium">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>
                  </td>
                </tr>
              ) : pageRows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/50 transition-all even:bg-gray-50/30">
                  <td className="px-3 py-2.5 text-gray-400 font-mono text-[11px]">{(page - 1) * PG + i + 1}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600">{r.repNo}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{r.pid}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',
                      r.right === 'UCS' ? 'bg-blue-100 text-blue-700' :
                      r.right === 'SSS' ? 'bg-orange-100 text-orange-700' :
                      r.right === 'WEL' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600')}>
                      {r.right || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.serviceDate}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-[11px] whitespace-nowrap">{r.sendDate}</td>
                  <td className="px-3 py-2.5 max-w-[260px]">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold',
                      isHepB(r.serviceName) ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      isHepC(r.serviceName) ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' :
                      'bg-gray-50 text-gray-600')}>
                      {isHepB(r.serviceName) ? '🟦 บี' : isHepC(r.serviceName) ? '🔵 ซี' : ''}
                      <span className="truncate max-w-[200px]">{r.serviceName}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold text-gray-700">{r.totalClaim > 0 ? fmtBaht(r.totalClaim) : '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold">
                    <span className={r.compensated > 0 ? 'text-emerald-600' : 'text-gray-300'}>
                      {r.compensated > 0 ? fmtBaht(r.compensated) : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cn('px-2.5 py-1 rounded-full text-[10.5px] font-bold',
                      r.status === 'ชดเชย' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                      {r.status === 'ชดเชย' ? '✓ ชดเชย' : '✕ ไม่ชดเชย'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-400 max-w-[200px]">
                    <span className="truncate block" title={r.noteOther || r.note}>
                      {r.noteOther ? r.noteOther.split('##')[1] || r.noteOther : r.note || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5 px-6 py-4 border-t border-gray-100 flex-wrap">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400 hover:text-blue-600 transition-all">‹</button>
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const p = totalPages <= 10 ? i + 1 : Math.max(1, Math.min(page - 4, totalPages - 9)) + i
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={cn('px-3 py-1.5 text-[12px] border rounded-lg transition-all',
                    p === page ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600')}>
                  {p}
                </button>
              )
            })}
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400 hover:text-blue-600 transition-all">›</button>
            <span className="text-[12px] text-gray-400 ml-2">หน้า {page} / {totalPages} · {fmtNum(filtered.length)} รายการ</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub components ────────────────────────────────────────────────
function KpiCard({ icon, label, sub, sub2, val, color, bar, barColor }: {
  icon: string; label: string; sub: string; sub2?: string; val: string; color: string; bar: number; barColor: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: barColor }} />
      <div className="text-2xl mb-3">{icon}</div>
      <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">{label}</div>
      <div className="text-[22px] font-black text-gray-900 mb-0.5">{val}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
      {sub2 && <div className="text-[12px] font-bold mt-1" style={{ color }}>{sub2}</div>}
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${bar * 100}%`, background: barColor }} />
      </div>
    </div>
  )
}

function SummaryCard({ title, rows, color, bgColor }: {
  title: string; rows: SeamlessRow[]; color: string; bgColor: string
}) {
  const comp = rows.filter(r => r.status === 'ชดเชย')
  const notComp = rows.filter(r => r.status === 'ไม่ชดเชย')
  const totalComp = comp.reduce((a, b) => a + b.compensated, 0)
  const pct = rows.length ? (comp.length / rows.length * 100) : 0

  // Group by reason for not compensated
  const reasons: Record<string, number> = {}
  for (const r of notComp) {
    const reason = r.noteOther ? (r.noteOther.split('##')[1] || r.noteOther).trim() : r.note || 'ไม่ระบุ'
    const shortReason = reason.length > 50 ? reason.slice(0, 50) + '...' : reason
    reasons[shortReason] = (reasons[shortReason] || 0) + 1
  }
  const topReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <div className="font-bold text-gray-900 text-[13px]">{title}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-3 rounded-xl" style={{ background: bgColor }}>
          <div className="text-[22px] font-black" style={{ color }}>{fmtNum(rows.length)}</div>
          <div className="text-[10px] text-gray-500 font-medium">รายการทั้งหมด</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-emerald-50">
          <div className="text-[22px] font-black text-emerald-600">{fmtNum(comp.length)}</div>
          <div className="text-[10px] text-gray-500 font-medium">ชดเชยแล้ว</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-red-50">
          <div className="text-[22px] font-black text-red-600">{fmtNum(notComp.length)}</div>
          <div className="text-[10px] text-gray-500 font-medium">ไม่ชดเชย</div>
        </div>
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-[11.5px] mb-1">
          <span className="text-gray-500">อัตราชดเชย</span>
          <span className="font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <div className="text-[12px] font-bold text-emerald-700 mb-3">
        ยอดชดเชยรวม: ฿{fmtBaht(totalComp)}
      </div>
      {topReasons.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">สาเหตุไม่ชดเชยที่พบบ่อย</div>
          {topReasons.map(([reason, count], i) => (
            <div key={i} className="flex items-start gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-red-400 mt-0.5 flex-shrink-0">✕</span>
              <span className="text-[11px] text-gray-600 leading-tight">{reason}</span>
              <span className="text-[10px] font-bold text-gray-400 ml-auto flex-shrink-0">{count} ครั้ง</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Export CSV ────────────────────────────────────────────────────
function exportCsv(rows: SeamlessRow[]) {
  const headers = ['ลำดับ','REP No.','Trans ID','HN','PID','ชื่อ-สกุล','สิทธิ','หน่วยบริการ','วันที่ส่งข้อมูล','วันที่รับบริการ','รายการบริการ','จำนวน','ราคา','ขอเบิกรวม','ชดเชย','ไม่ชดเชย','สถานะ','หมายเหตุ']
  const csvRows = rows.map((r, i) => [
    i+1, r.repNo, r.transId, r.hn, r.pid, r.name, r.right, r.hmain,
    r.sendDate, r.serviceDate, r.serviceName, r.qty, r.price, r.totalClaim,
    r.compensated, r.notComp, r.status,
    (r.noteOther ? r.noteOther.split('##')[1] || r.noteOther : r.note) || '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `seamless_hep_${new Date().toISOString().split('T')[0]}.csv`
  a.click(); URL.revokeObjectURL(url)
}