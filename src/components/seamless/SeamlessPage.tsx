'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────
interface SeamlessRow {
  id?: number
  seq: string
  rep_no: string
  trans_id: string
  hn: string
  pid: string
  name: string
  rights: string
  hmain: string
  send_date: string
  service_date: string
  item_seq: string
  service_name: string
  qty: number
  price: number
  ceiling: number
  total_claim: number
  ps_code: string
  ps_pct: number
  compensated: number
  not_comp: number
  extra: number
  recall: number
  status: string
  note: string
  note_other: string
  hsend: string
  source_file: string
  imported_at?: string
}

// ── Parser ────────────────────────────────────────────────────────
async function parseSeamlessXlsx(file: File): Promise<SeamlessRow[]> {
  const XLSX = (await import('xlsx')).default
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as string[][]

  // หา data start row (แถวที่มี ลำดับที่ + REP)
  let dataStart = 10
  for (let i = 0; i < raw.length; i++) {
    const joined = raw[i].join('')
    if (joined.includes('ลำดับที่') && joined.includes('REP')) {
      dataStart = i + 3
      break
    }
  }

  const rows: SeamlessRow[] = []
  for (let i = dataStart; i < raw.length; i++) {
    const r = raw[i].map(v => String(v ?? '').trim())
    // ข้ามแถวว่าง
    if (!r[1] && !r[2]) continue
    if (!r[0] && !r[1]) continue

    rows.push({
      seq:          r[0]  || '',
      rep_no:       r[1]  || '',
      trans_id:     r[2]  || '',
      hn:           r[3]  || '',
      pid:          r[5]  || r[4] || '',
      name:         r[6]  || r[4] || '',
      rights:       r[7]  || '',
      hmain:        r[8]  || '',
      send_date:    r[9]  || '',
      service_date: r[10] || '',
      item_seq:     r[11] || '',
      service_name: r[12] || '',
      qty:          parseFloat(r[13]) || 0,
      price:        parseFloat(r[14]) || 0,
      ceiling:      parseFloat(r[15]) || 0,
      total_claim:  parseFloat(r[16]) || 0,
      ps_code:      r[17] || '',
      ps_pct:       parseFloat(r[18]) || 0,
      compensated:  parseFloat(r[19]) || 0,
      not_comp:     parseFloat(r[20]) || 0,
      extra:        parseFloat(r[21]) || 0,
      recall:       parseFloat(r[22]) || 0,
      status:       r[23] || '',
      note:         r[24] || '',
      note_other:   r[25] || '',
      hsend:        r[26] || '',
      source_file:  file.name,
    })
  }
  return rows
}

// ── Helpers ───────────────────────────────────────────────────────
const isHepB = (s: string) =>
  s.includes('ไวรัสตับอักเสบ บี') || s.includes('ตับอักเสบบี') || s.includes('HBsAg')
const isHepC = (s: string) =>
  s.includes('ไวรัสตับอักเสบ ซี') || s.includes('ตับอักเสบซี') || s.includes('Anti-HCV')

const fmtBaht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtNum = (n: number) => n.toLocaleString('th-TH')

// ── Main Component ────────────────────────────────────────────────
export function SeamlessPage() {
  const [rows, setRows]             = useState<SeamlessRow[]>([])
  const [dbLoading, setDbLoading]   = useState(true)
  const [importing, setImporting]   = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [page, setPage]             = useState(1)
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const PG = 50

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ── โหลดจาก Supabase เมื่อเปิดหน้า ──────────────────────────
  useEffect(() => {
    setDbLoading(true)
    fetch('/api/seamless')
      .then(r => r.json())
      .then(json => {
        if (json.ok) setRows(json.data as SeamlessRow[])
        else showToast(`โหลดข้อมูลไม่สำเร็จ: ${json.error}`, false)
      })
      .catch(e => showToast(`เกิดข้อผิดพลาด: ${String(e)}`, false))
      .finally(() => setDbLoading(false))
  }, [showToast])

  // ── Import ไฟล์ → parse → บันทึก Supabase ────────────────────
  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setImporting(true)

    let totalImported = 0
    let totalSkipped = 0

    for (const f of Array.from(fileList)) {
      if (!f.name.match(/\.(xlsx|xls)$/i)) continue
      try {
        const parsed = await parseSeamlessXlsx(f)
        if (!parsed.length) { showToast(`ไม่พบข้อมูลในไฟล์ ${f.name}`, false); continue }

        const res = await fetch('/api/seamless', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: parsed }),
        })
        const json = await res.json()

        if (json.ok) {
          totalImported += json.imported ?? 0
          totalSkipped  += parsed.length - (json.imported ?? 0)
          // อัปเดต state โดยเพิ่มแถวใหม่ที่ยังไม่มี (ตรวจด้วย trans_id+item_seq)
          setRows(prev => {
            const existing = new Set(prev.map(r => `${r.trans_id}|${r.item_seq}`))
            const newRows = parsed.filter(r => !existing.has(`${r.trans_id}|${r.item_seq}`))
            return [...prev, ...newRows]
          })
        } else {
          showToast(`บันทึกไฟล์ ${f.name} ไม่สำเร็จ: ${json.error}`, false)
        }
      } catch (e) {
        showToast(`อ่านไฟล์ ${f.name} ไม่สำเร็จ: ${String(e)}`, false)
      }
    }

    if (totalImported > 0 || totalSkipped > 0) {
      showToast(
        `✓ นำเข้าสำเร็จ: เพิ่ม ${fmtNum(totalImported)} รายการ · ข้ามซ้ำ ${fmtNum(totalSkipped)} รายการ`,
        true,
      )
    }
    setPage(1)
    setImporting(false)
  }, [showToast])

  // ── ล้างข้อมูลทั้งหมด ─────────────────────────────────────────
  const handleClearAll = useCallback(async () => {
    setConfirmClear(false)
    setImporting(true)
    try {
      const res = await fetch('/api/seamless', { method: 'DELETE' })
      const json = await res.json()
      if (json.ok) {
        setRows([])
        setPage(1)
        showToast('✓ ล้างข้อมูลทั้งหมดเรียบร้อยแล้ว', true)
      } else {
        showToast(`ล้างข้อมูลไม่สำเร็จ: ${json.error}`, false)
      }
    } catch (e) {
      showToast(`เกิดข้อผิดพลาด: ${String(e)}`, false)
    } finally {
      setImporting(false)
    }
  }, [showToast])

  // ── Filter: เฉพาะ hepatitis ───────────────────────────────────
  const hepRows = useMemo(() =>
    rows.filter(r => isHepB(r.service_name) || isHepC(r.service_name)),
    [rows])

  const filtered = useMemo(() => {
    let r = filterType === 'hepB' ? hepRows.filter(x => isHepB(x.service_name))
          : filterType === 'hepC' ? hepRows.filter(x => isHepC(x.service_name))
          : hepRows

    if (filterStatus !== 'all') r = r.filter(x => x.status === filterStatus)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x =>
        x.name.toLowerCase().includes(q) ||
        x.pid.includes(q) ||
        x.rep_no.toLowerCase().includes(q) ||
        x.trans_id.includes(q) ||
        x.service_date.includes(q)
      )
    }
    return r
  }, [hepRows, filterType, filterStatus, search])

  // ── KPI ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const hepB   = hepRows.filter(r => isHepB(r.service_name))
    const hepC   = hepRows.filter(r => isHepC(r.service_name))
    const comp   = hepRows.filter(r => r.status === 'ชดเชย')
    const notComp= hepRows.filter(r => r.status === 'ไม่ชดเชย')
    return {
      total: hepRows.length,
      hepB: hepB.length, hepC: hepC.length,
      comp: comp.length, notComp: notComp.length,
      totalComp:    comp.reduce((a, b) => a + b.compensated, 0),
      totalClaim:   hepRows.reduce((a, b) => a + b.total_claim, 0),
      totalNotComp: notComp.reduce((a, b) => a + b.total_claim, 0),
      uniqueB: new Set(hepB.map(r => r.pid)).size,
      uniqueC: new Set(hepC.map(r => r.pid)).size,
      // source files
      sourceFiles: [...new Set(rows.map(r => r.source_file))],
    }
  }, [hepRows, rows])

  const totalPages = Math.ceil(filtered.length / PG)
  const pageRows   = filtered.slice((page - 1) * PG, page * PG)

  // ── Empty state ───────────────────────────────────────────────
  if (!dbLoading && rows.length === 0) {
    return (
      <div className="max-w-[860px] mx-auto px-8 py-14">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            Seamless For DMIS — สปสช.
          </div>
          <h1 className="text-[26px] font-black text-gray-900 leading-tight mb-2">
            ติดตามข้อมูลการจ่ายชดเชย<br />
            <span className="text-blue-600">โรคเฉพาะ (REP Individual)</span>
          </h1>
          <p className="text-[13px] text-gray-500 leading-relaxed max-w-[540px]">
            นำเข้าไฟล์ .xlsx จากระบบ Seamless For DMIS ของ สปสช.
            ข้อมูลจะถูกบันทึกลง Supabase — เปิดใหม่ข้อมูลยังคงอยู่
          </p>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-5 cursor-pointer transition-all',
            dragOver ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-200 bg-gray-50/50 hover:border-blue-300 hover:bg-blue-50/30',
          )}>
          <div className={cn('w-20 h-20 rounded-2xl flex items-center justify-center text-4xl transition-all', dragOver ? 'bg-blue-100' : 'bg-gray-100')}>
            {importing ? '⏳' : '📊'}
          </div>
          <div className="text-center">
            <div className="text-[16px] font-bold text-gray-800 mb-1">
              {importing ? 'กำลังนำเข้าและบันทึกข้อมูล...' : 'ลากไฟล์มาวางที่นี่'}
            </div>
            <div className="text-[13px] text-gray-400">
              {importing ? 'กรุณารอสักครู่' : 'หรือคลิกเพื่อเลือกไฟล์ .xlsx จาก Seamless (รองรับหลายไฟล์)'}
            </div>
          </div>
          {importing && (
            <div className="flex items-center gap-2 text-[13px] text-blue-600 font-semibold">
              <span className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              กำลังประมวลผลและบันทึกลง Supabase...
            </div>
          )}
          <div className="text-[11.5px] text-gray-400 bg-white border border-gray-200 rounded-xl px-5 py-3.5 text-left max-w-[420px] w-full">
            <div className="font-bold text-gray-600 mb-2">วิธีดาวน์โหลดไฟล์จาก Seamless:</div>
            <ol className="space-y-1 list-decimal list-inside text-gray-500">
              <li>ไปที่ seamlessfordmis.nhso.go.th</li>
              <li>เมนู REP → รายงาน REP แบบ INDIVIDUAL</li>
              <li>เลือก Krungthai Digital Health Platform</li>
              <li>กด ออกรายงาน → Export Excel</li>
            </ol>
          </div>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </div>
    )
  }

  // ── Loading state ─────────────────────────────────────────────
  if (dbLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin" />
        <div className="text-[13px] text-gray-500">กำลังโหลดข้อมูล Seamless จาก Supabase...</div>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────
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

      {/* Confirm Clear Dialog */}
      {confirmClear && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-6"
          onClick={() => setConfirmClear(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[400px] p-7" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="w-6 h-6">
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
              </svg>
            </div>
            <div className="text-center mb-5">
              <div className="text-[16px] font-bold text-gray-900 mb-1">ยืนยันการล้างข้อมูล</div>
              <div className="text-[13px] text-gray-500">
                จะลบข้อมูล Seamless ทั้งหมด <span className="font-bold text-gray-800">{fmtNum(rows.length)} รายการ</span> ออกจาก Supabase
              </div>
              <div className="text-[11.5px] text-red-500 mt-2 font-medium">⚠ ไม่สามารถยกเลิกได้</div>
            </div>
            <div className="flex gap-2 justify-center">
              <button onClick={() => setConfirmClear(false)}
                className="px-5 py-2 text-[12.5px] font-semibold border border-gray-200 rounded-lg text-gray-500 hover:border-gray-300 transition-all">
                ยกเลิก
              </button>
              <button onClick={handleClearAll}
                className="px-5 py-2 text-[12.5px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all shadow-sm">
                ล้างข้อมูลทั้งหมด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Seamless For DMIS · บันทึกใน Supabase
          </div>
          <h1 className="text-[19px] font-black text-gray-900">
            ติดตามการจ่ายชดเชยไวรัสตับอักเสบ บี &amp; ซี
          </h1>
          <div className="text-[12px] text-gray-400 mt-0.5">
            {fmtNum(rows.length)} รายการทั้งหมด · พบบริการตับอักเสบ {fmtNum(hepRows.length)} รายการ
            {stats.sourceFiles.length > 0 && ` · ${stats.sourceFiles.length} ไฟล์`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => inputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold bg-blue-50 border border-blue-200 text-blue-600 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-40">
            {importing
              ? <><span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />กำลังนำเข้า...</>
              : <>+ เพิ่มไฟล์ .xlsx</>}
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold bg-gray-50 border border-gray-200 text-gray-500 rounded-xl hover:border-red-200 hover:text-red-500 transition-all disabled:opacity-40">
            🗑 ล้างทั้งหมด
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
        </div>
      </div>

      {/* Source files chips */}
      {stats.sourceFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {stats.sourceFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600">
              <span className="text-blue-400">📄</span> {f}
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard icon="🔬" label="บริการตับอักเสบ บี"
          val={fmtNum(stats.hepB)} sub={`${fmtNum(stats.uniqueB)} คน (ไม่ซ้ำ)`}
          barColor="#2563eb" bar={stats.total ? stats.hepB / stats.total : 0} />
        <KpiCard icon="🧬" label="บริการตับอักเสบ ซี"
          val={fmtNum(stats.hepC)} sub={`${fmtNum(stats.uniqueC)} คน (ไม่ซ้ำ)`}
          barColor="#0891b2" bar={stats.total ? stats.hepC / stats.total : 0} />
        <KpiCard icon="✅" label="ได้รับการชดเชย"
          val={`${fmtNum(stats.comp)} รายการ`}
          sub={`${stats.total ? (stats.comp / stats.total * 100).toFixed(1) : 0}% ของทั้งหมด`}
          sub2={`฿${fmtBaht(stats.totalComp)}`}
          barColor="#059669" bar={stats.total ? stats.comp / stats.total : 0} />
        <KpiCard icon="❌" label="ไม่ได้รับการชดเชย"
          val={`${fmtNum(stats.notComp)} รายการ`}
          sub={`฿${fmtBaht(stats.totalNotComp)} ที่ขอเบิก`}
          barColor="#dc2626" bar={stats.total ? stats.notComp / stats.total : 0} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <SummaryCard
          title="สรุปบริการตรวจคัดกรองไวรัสตับอักเสบ บี"
          rows={hepRows.filter(r => isHepB(r.service_name))}
          color="#2563eb" bgColor="#eff6ff"
        />
        <SummaryCard
          title="สรุปบริการตรวจคัดกรองไวรัสตับอักเสบ ซี"
          rows={hepRows.filter(r => isHepC(r.service_name))}
          color="#0891b2" bgColor="#ecfeff"
        />
      </div>

      {/* Table section */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <div className="font-bold text-gray-900 text-[13.5px]">รายการบริการตับอักเสบทั้งหมด</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Type tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {[['all','ทั้งหมด'],['hepB','ตับอักเสบ บี'],['hepC','ตับอักเสบ ซี']].map(([v,l]) => (
                <button key={v} onClick={() => { setFilterType(v); setPage(1) }}
                  className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',
                    filterType === v ? 'bg-white font-bold text-blue-600 shadow-sm' : 'text-gray-500 hover:text-blue-500')}>
                  {l}
                </button>
              ))}
            </div>
            {/* Status tabs */}
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
            <button onClick={() => exportCsv(filtered)}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
                <path d="M8 2v8M5 7l3 3 3-3M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1"/>
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-[12px]">
          <StatChip dot="#6b7280" label="แสดง" val={fmtNum(filtered.length)} unit="รายการ" />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot="#059669" label="ชดเชย" val={`฿${fmtBaht(filtered.filter(r => r.status === 'ชดเชย').reduce((a, b) => a + b.compensated, 0))}`} unit="" />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot="#dc2626" label="ไม่ชดเชย" val={fmtNum(filtered.filter(r => r.status === 'ไม่ชดเชย').length)} unit="รายการ" />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot="#2563eb" label="ขอเบิกรวม" val={`฿${fmtBaht(filtered.reduce((a, b) => a + b.total_claim, 0))}`} unit="" />
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '60vh' }}>
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b-2 border-gray-100">
              <tr>
                {['#','REP No.','ชื่อ-สกุล','PID','สิทธิ','วันที่บริการ','วันที่ส่งข้อมูล','รายการบริการ','ขอเบิก (฿)','ชดเชย (฿)','สถานะ','หมายเหตุ'].map(h => (
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
                <tr key={r.id ?? i} className="border-b border-gray-100 hover:bg-blue-50/50 transition-all even:bg-gray-50/30">
                  <td className="px-3 py-2.5 text-gray-400 font-mono text-[11px]">{(page - 1) * PG + i + 1}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600 whitespace-nowrap">{r.rep_no}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{r.pid}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',
                      r.rights === 'UCS' ? 'bg-blue-100 text-blue-700' :
                      r.rights === 'SSS' ? 'bg-orange-100 text-orange-700' :
                      r.rights === 'WEL' ? 'bg-purple-100 text-purple-700' :
                      'bg-gray-100 text-gray-600')}>
                      {r.rights || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.service_date}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-[11px] whitespace-nowrap">{r.send_date}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold',
                      isHepB(r.service_name) ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      isHepC(r.service_name) ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' :
                      'bg-gray-50 text-gray-600')}>
                      {isHepB(r.service_name) ? '🟦' : isHepC(r.service_name) ? '🔵' : ''}
                      <span className="truncate max-w-[220px]">{r.service_name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold text-gray-700">
                    {r.total_claim > 0 ? fmtBaht(r.total_claim) : '—'}
                  </td>
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
                    <span className="truncate block" title={r.note_other || r.note}>
                      {r.note_other ? (r.note_other.split('##')[1] || r.note_other) : r.note || '—'}
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
function KpiCard({ icon, label, val, sub, sub2, bar, barColor }: {
  icon: string; label: string; val: string; sub: string; sub2?: string; bar: number; barColor: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: barColor }} />
      <div className="text-2xl mb-3">{icon}</div>
      <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">{label}</div>
      <div className="text-[22px] font-black text-gray-900 mb-0.5">{val}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
      {sub2 && <div className="text-[12px] font-bold mt-1" style={{ color: barColor }}>{sub2}</div>}
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${bar * 100}%`, background: barColor }} />
      </div>
    </div>
  )
}

function SummaryCard({ title, rows, color, bgColor }: {
  title: string; rows: SeamlessRow[]; color: string; bgColor: string
}) {
  const comp    = rows.filter(r => r.status === 'ชดเชย')
  const notComp = rows.filter(r => r.status === 'ไม่ชดเชย')
  const pct     = rows.length ? (comp.length / rows.length * 100) : 0

  const reasons: Record<string, number> = {}
  for (const r of notComp) {
    const raw = r.note_other ? (r.note_other.split('##')[1] || r.note_other).trim() : r.note || 'ไม่ระบุ'
    const key = raw.length > 55 ? raw.slice(0, 55) + '…' : raw
    reasons[key] = (reasons[key] || 0) + 1
  }
  const topReasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <div className="font-bold text-gray-900 text-[13px]">{title}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-3 rounded-xl" style={{ background: bgColor }}>
          <div className="text-[20px] font-black" style={{ color }}>{fmtNum(rows.length)}</div>
          <div className="text-[10px] text-gray-500 font-medium">รายการทั้งหมด</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-emerald-50">
          <div className="text-[20px] font-black text-emerald-600">{fmtNum(comp.length)}</div>
          <div className="text-[10px] text-gray-500 font-medium">ชดเชยแล้ว</div>
        </div>
        <div className="text-center p-3 rounded-xl bg-red-50">
          <div className="text-[20px] font-black text-red-600">{fmtNum(notComp.length)}</div>
          <div className="text-[10px] text-gray-500 font-medium">ไม่ชดเชย</div>
        </div>
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-[11.5px] mb-1">
          <span className="text-gray-500">อัตราชดเชย</span>
          <span className="font-bold" style={{ color }}>{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
      <div className="text-[12px] font-bold text-emerald-700 mb-3">
        ยอดชดเชยรวม: ฿{fmtBaht(comp.reduce((a, b) => a + b.compensated, 0))}
      </div>
      {topReasons.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">สาเหตุไม่ชดเชยที่พบบ่อย</div>
          {topReasons.map(([reason, count], i) => (
            <div key={i} className="flex items-start gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-red-400 mt-0.5 flex-shrink-0">✕</span>
              <span className="text-[11px] text-gray-600 leading-tight flex-1">{reason}</span>
              <span className="text-[10px] font-bold text-gray-400 ml-auto flex-shrink-0">{count} ครั้ง</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatChip({ dot, label, val, unit }: { dot: string; label: string; val: string; unit: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-800">{val}</span>
      {unit && <span className="text-gray-400">{unit}</span>}
    </div>
  )
}

// ── Export CSV ────────────────────────────────────────────────────
function exportCsv(rows: SeamlessRow[]) {
  const headers = ['ลำดับ','REP No.','Trans ID','HN','PID','ชื่อ-สกุล','สิทธิ','หน่วยบริการ','วันที่ส่งข้อมูล','วันที่รับบริการ','รายการบริการ','จำนวน','ราคา','ขอเบิกรวม','ชดเชย','ไม่ชดเชย','สถานะ','หมายเหตุ','ไฟล์ต้นทาง']
  const csvRows = rows.map((r, i) => [
    i+1, r.rep_no, r.trans_id, r.hn, r.pid, r.name, r.rights, r.hmain,
    r.send_date, r.service_date, r.service_name, r.qty, r.price,
    r.total_claim, r.compensated, r.not_comp, r.status,
    (r.note_other ? (r.note_other.split('##')[1] || r.note_other) : r.note) || '',
    r.source_file,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `seamless_hep_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}