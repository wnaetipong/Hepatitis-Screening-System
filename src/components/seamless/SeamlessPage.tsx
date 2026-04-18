'use client'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────
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

// ── SheetJS CDN ───────────────────────────────────────────────────
declare global {
  interface Window {
    XLSX: {
      read: (data: string, opts: { type: string; cellDates?: boolean }) => {
        SheetNames: string[]
        Sheets: Record<string, { '!ref'?: string; [key: string]: unknown }>
      }
      utils: {
        sheet_to_json: <T>(ws: unknown, opts: { header: number; defval: string; raw: boolean }) => T[]
        decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } }
        encode_range: (range: { s: { r: number; c: number }; e: { r: number; c: number } }) => string
      }
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

// ── Parser ────────────────────────────────────────────────────────
// ปัญหา: ไฟล์ Seamless มี <dimension ref="A2:AB10"> ผิดพลาด
// แต่มีข้อมูลจริง 15,592 แถว
// แก้ด้วยการ override ws['!ref'] ให้ครอบคลุมทั้งหมด

function readFileAsBinaryString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsBinaryString(file)
  })
}

async function parseSeamlessXlsx(file: File): Promise<{ rows: SeamlessRow[]; error?: string }> {
  console.log('[Seamless] parsing:', file.name)
  try {
    const XLSX = await loadSheetJS()
    const bstr = await readFileAsBinaryString(file)

    const wb = XLSX.read(bstr, { type: 'binary', cellDates: false })
    console.log('[Seamless] sheets:', wb.SheetNames)

    if (!wb.SheetNames.length) return { rows: [], error: 'ไม่พบ sheet' }

    const ws = wb.Sheets[wb.SheetNames[0]]

    // ── KEY FIX: override !ref ให้ครอบคลุมทุก cell จริง ──────────
    // ไฟล์ Seamless มี dimension ref ผิด (บอกแค่ 10 แถว แต่มีจริง 15,000+)
    // ต้องหา last row จาก cell keys จริงๆ แทน
    const cellKeys = Object.keys(ws).filter(k => !k.startsWith('!'))
    if (cellKeys.length > 0) {
      let maxRow = 0, maxCol = 0
      for (const key of cellKeys) {
        const match = key.match(/^([A-Z]+)(\d+)$/)
        if (match) {
          const row = parseInt(match[2])
          const col = match[1].split('').reduce((acc, c) => acc * 26 + c.charCodeAt(0) - 64, 0)
          if (row > maxRow) maxRow = row
          if (col > maxCol) maxCol = col
        }
      }
      const newRef = `A1:${String.fromCharCode(64 + Math.min(maxCol, 26))}${maxRow}`
      console.log('[Seamless] original ref:', ws['!ref'], '→ override to:', newRef)
      ws['!ref'] = newRef
    }
    // ─────────────────────────────────────────────────────────────

    const raw = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1, defval: '', raw: true,
    }) as (string | number | null)[][]

    console.log('[Seamless] raw rows after fix:', raw.length)
    if (raw[10]) console.log('[Seamless] row 10:', raw[10].slice(0, 6).map(String))

    if (!raw.length) return { rows: [], error: 'ไฟล์ว่าง' }

    const c = (row: (string|number|null)[], i: number) => {
      const v = row[i]; if (v === null || v === undefined || v === '') return ''
      return String(v).trim()
    }
    const n = (row: (string|number|null)[], i: number) => {
      const v = parseFloat(String(row[i] ?? '')); return isNaN(v) ? 0 : v
    }

    // หา dataStart (แถวที่มี header "ลำดับที่" + "REP No.")
    let dataStart = 10
    for (let i = 0; i < Math.min(20, raw.length); i++) {
      const joined = raw[i].map(v => String(v ?? '')).join('|')
      if (joined.includes('ลำดับที่') && joined.includes('REP')) {
        dataStart = i + 3
        console.log('[Seamless] header at row', i, '→ dataStart:', dataStart)
        break
      }
    }

    const rows: SeamlessRow[] = []
    for (let i = dataStart; i < raw.length; i++) {
      const row = raw[i]
      const repNo = c(row, 1), transId = c(row, 2)
      if (!repNo || !transId) continue
      rows.push({
        seq: c(row,0), rep_no: repNo, trans_id: transId, hn: c(row,3),
        pid: c(row,5), name: c(row,6), rights: c(row,7), hmain: c(row,8),
        send_date: c(row,9), service_date: c(row,10), item_seq: c(row,11),
        service_name: c(row,12), qty: n(row,13), price: n(row,14),
        ceiling: n(row,15), total_claim: n(row,16), ps_code: c(row,17),
        ps_pct: n(row,18), compensated: n(row,19), not_comp: n(row,20),
        extra: n(row,21), recall: n(row,22), status: c(row,23),
        note: c(row,24), note_other: c(row,25), hsend: c(row,26),
        source_file: file.name,
      })
    }

    console.log('[Seamless] parsed rows:', rows.length)
    if (rows[0]) console.log('[Seamless] sample:', rows[0].name, '|', rows[0].service_name, '|', rows[0].status)
    return { rows }
  } catch (e) {
    console.error('[Seamless] error:', e)
    return { rows: [], error: String(e) }
  }
}

// ── Helpers ───────────────────────────────────────────────────────
const isHepB = (s: string) => s.includes('ไวรัสตับอักเสบ บี') || s.includes('HBsAg')
const isHepC = (s: string) => s.includes('ไวรัสตับอักเสบ ซี') || s.includes('Anti-HCV')
const fmtBaht = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const fmtNum  = (n: number) => n.toLocaleString('th-TH')

// ── Component ─────────────────────────────────────────────────────
export function SeamlessPage() {
  const [rows, setRows]             = useState<SeamlessRow[]>([])
  const [dbLoading, setDbLoading]   = useState(true)
  const [importing, setImporting]   = useState(false)
  const [importProgress, setIP]     = useState('')
  const [dragOver, setDragOver]     = useState(false)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFStatus]  = useState('all')
  const [filterType, setFType]      = useState('all')
  const [filterHsend, setFHsend]    = useState<string[]>([])  // multi-select HSEND
  const [page, setPage]             = useState(1)
  const [toast, setToast]           = useState<{msg:string;ok:boolean}|null>(null)
  const [confirmClear, setConfirm]  = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const PG = 50

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 5000)
  }, [])

  useEffect(() => {
    fetch('/api/seamless').then(r => r.json())
      .then(j => {
        if (j.ok) {
          setRows(j.data)
          // debug: ดู hsend values จาก Supabase
          const sample = (j.data as SeamlessRow[]).slice(0, 3)
          console.log('[Seamless] sample rows hsend:', sample.map((r: SeamlessRow) => ({hsend: r.hsend, hmain: r.hmain, name: r.name})))
        } else showToast(j.error, false)
      })
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
      // แบ่ง batch ละ 500 แถว เพื่อหลีกเลี่ยง Vercel 4.5MB limit
      const BATCH = 500
      const batches = Math.ceil(parsed.length / BATCH)
      let batchOk = true
      for (let b = 0; b < batches; b++) {
        const chunk = parsed.slice(b * BATCH, (b + 1) * BATCH)
        setIP(`กำลังบันทึก batch ${b+1}/${batches} (${fmtNum(chunk.length)} รายการ)...`)
        try {
          const j = await fetch('/api/seamless', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: chunk }),
          }).then(r => r.json())
          if (j.ok) {
            totalNew += j.imported ?? 0; totalSkip += chunk.length - (j.imported ?? 0)
            setRows(prev => {
              const ex = new Set(prev.map(r => `${r.trans_id}|${r.item_seq}`))
              return [...prev, ...chunk.filter(r => !ex.has(`${r.trans_id}|${r.item_seq}`))]
            })
          } else { showToast(`บันทึก batch ${b+1} ไม่สำเร็จ: ${j.error}`, false); batchOk = false; break }
        } catch (e) { showToast(String(e), false); batchOk = false; break }
      }
      if (!batchOk) continue
    }
    showToast(
      totalNew > 0 ? `✓ เพิ่มใหม่ ${fmtNum(totalNew)} · ข้ามซ้ำ ${fmtNum(totalSkip)} รายการ` : `ไม่มีข้อมูลใหม่ (ซ้ำ ${fmtNum(totalSkip)})`,
      totalNew > 0,
    )
    setPage(1); setIP(''); setImporting(false)
  }, [showToast])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = ''
    if (files.length) processFiles(files)
  }, [processFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    processFiles(Array.from(e.dataTransfer.files))
  }, [processFiles])

  const handleClearAll = useCallback(async () => {
    setConfirm(false); setImporting(true); setIP('กำลังล้างข้อมูล...')
    const j = await fetch('/api/seamless', { method: 'DELETE' }).then(r => r.json())
    if (j.ok) { setRows([]); setPage(1); showToast('✓ ล้างข้อมูลเรียบร้อย', true) }
    else showToast(j.error, false)
    setIP(''); setImporting(false)
  }, [showToast])

  const hepRows = useMemo(() =>
    rows.filter(r => isHepB(r.service_name) || isHepC(r.service_name)), [rows])

  const filtered = useMemo(() => {
    let r = filterType === 'hepB' ? hepRows.filter(x => isHepB(x.service_name))
          : filterType === 'hepC' ? hepRows.filter(x => isHepC(x.service_name)) : hepRows
    if (filterStatus !== 'all') r = r.filter(x => x.status === filterStatus)
    // กรองตาม HSEND (multi-select)
    if (filterHsend.length > 0) r = r.filter(x => filterHsend.includes(x.hsend || x.hmain || ''))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x => x.name.toLowerCase().includes(q) || x.pid.includes(q) ||
        x.rep_no.toLowerCase().includes(q) || x.service_date.includes(q))
    }
    return r
  }, [hepRows, filterType, filterStatus, filterHsend, search])

  const stats = useMemo(() => {
    const hepB = hepRows.filter(r => isHepB(r.service_name))
    const hepC = hepRows.filter(r => isHepC(r.service_name))
    const comp = hepRows.filter(r => r.status === 'ชดเชย')
    const notComp = hepRows.filter(r => r.status === 'ไม่ชดเชย')
    return {
      total: hepRows.length, hepB: hepB.length, hepC: hepC.length,
      comp: comp.length, notComp: notComp.length,
      totalComp: comp.reduce((a,b) => a+b.compensated, 0),
      totalNotComp: notComp.reduce((a,b) => a+b.total_claim, 0),
      uniqueB: new Set(hepB.map(r => r.pid)).size,
      uniqueC: new Set(hepC.map(r => r.pid)).size,
      sourceFiles: [...new Set(rows.map(r => r.source_file))],
      hsendOptions: [...new Set(rows.map(r => (r.hsend || r.hmain || '')).filter(Boolean))].sort(),
    }
  }, [hepRows, rows])

  const totalPages = Math.ceil(filtered.length / PG)
  const pageRows   = filtered.slice((page-1)*PG, page*PG)

  if (dbLoading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="w-10 h-10 border-[3px] border-gray-200 border-t-blue-600 rounded-full animate-spin"/>
      <div className="text-[13px] text-gray-500">กำลังโหลดข้อมูลจาก Supabase...</div>
    </div>
  )

  if (rows.length === 0) return (
    <div className="max-w-[820px] mx-auto px-8 py-12">
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleInput}/>
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full mb-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-600"/>Seamless For DMIS — สปสช.
        </div>
        <h1 className="text-[24px] font-black text-gray-900 leading-tight mb-2">
          ติดตามข้อมูลการจ่ายชดเชย<br/><span className="text-blue-600">โรคเฉพาะ (REP Individual)</span>
        </h1>
        <p className="text-[13px] text-gray-500">ข้อมูลจะบันทึกลง Supabase — เปิดใหม่ข้อมูลยังคงอยู่</p>
      </div>

      {importing ? (
        <div className="border-2 border-blue-200 bg-blue-50/60 rounded-2xl p-14 flex flex-col items-center gap-4">
          <span className="w-10 h-10 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
          <div className="text-[14px] font-bold text-gray-800">กำลังดำเนินการ...</div>
          <div className="text-[12.5px] text-blue-600">{importProgress}</div>
        </div>
      ) : (
        <div onDragOver={e=>{e.preventDefault();e.stopPropagation();setDragOver(true)}}
          onDragLeave={e=>{e.preventDefault();e.stopPropagation();setDragOver(false)}}
          onDrop={handleDrop}
          className={cn('border-2 border-dashed rounded-2xl transition-all p-14 flex flex-col items-center gap-5',
            dragOver?'border-blue-500 bg-blue-50/60':'border-gray-200 bg-gray-50/40 hover:border-blue-300')}>
          <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center text-3xl',dragOver?'bg-blue-100':'bg-gray-100')}>
            {dragOver?'📂':'📊'}
          </div>
          <div className="text-center">
            <div className="text-[15px] font-bold text-gray-800 mb-1">{dragOver?'วางไฟล์ได้เลย':'ลากไฟล์มาวางที่นี่'}</div>
            <div className="text-[12.5px] text-gray-400 mb-4">รองรับหลายไฟล์พร้อมกัน (.xlsx / .xls)</div>
            <button type="button" onClick={()=>inputRef.current?.click()}
              className="px-6 py-2.5 text-[13px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-sm">
              เลือกไฟล์จากเครื่อง
            </button>
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

  return (
    <div className="max-w-[1440px] mx-auto px-8 py-7">
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleInput}/>

      {toast && (
        <div className={cn('fixed bottom-7 right-7 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-xl border text-sm shadow-xl animate-fade-up',
          toast.ok?'bg-emerald-50 border-emerald-200 text-emerald-800':'bg-red-50 border-red-200 text-red-800')}>
          <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',
            toast.ok?'bg-emerald-500':'bg-red-500')}>{toast.ok?'✓':'✕'}</span>
          {toast.msg}
        </div>
      )}

      {importing && (
        <div className="fixed inset-0 bg-gray-900/30 backdrop-blur-sm z-[998] flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-4 min-w-[320px]">
            <span className="w-10 h-10 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin"/>
            <div className="text-[14px] font-bold text-gray-800">กำลังดำเนินการ</div>
            <div className="text-[12px] text-blue-600 text-center max-w-[260px]">{importProgress}</div>
          </div>
        </div>
      )}

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

      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"/>Seamless For DMIS · Supabase
          </div>
          <h1 className="text-[19px] font-black text-gray-900">ติดตามการจ่ายชดเชยไวรัสตับอักเสบ บี &amp; ซี</h1>
          <div className="text-[12px] text-gray-400 mt-0.5">
            {fmtNum(rows.length)} รายการ · ตับอักเสบ {fmtNum(hepRows.length)} รายการ{stats.sourceFiles.length>0&&` · ${stats.sourceFiles.length} ไฟล์`}
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

      {stats.sourceFiles.length>0&&(
        <div className="flex flex-wrap gap-2 mb-5">
          {stats.sourceFiles.map((f,i)=>(
            <div key={i} className="flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600">
              <span className="text-blue-400">📄</span>{f}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4 mb-5">
        <KpiCard icon="🔬" label="บริการตับอักเสบ บี" val={fmtNum(stats.hepB)} sub={`${fmtNum(stats.uniqueB)} คน`} barColor="#2563eb" bar={stats.total?stats.hepB/stats.total:0}/>
        <KpiCard icon="🧬" label="บริการตับอักเสบ ซี" val={fmtNum(stats.hepC)} sub={`${fmtNum(stats.uniqueC)} คน`} barColor="#0891b2" bar={stats.total?stats.hepC/stats.total:0}/>
        <KpiCard icon="✅" label="ได้รับการชดเชย" val={`${fmtNum(stats.comp)} รายการ`} sub={`${stats.total?(stats.comp/stats.total*100).toFixed(1):0}%`} sub2={`฿${fmtBaht(stats.totalComp)}`} barColor="#059669" bar={stats.total?stats.comp/stats.total:0}/>
        <KpiCard icon="❌" label="ไม่ได้รับการชดเชย" val={`${fmtNum(stats.notComp)} รายการ`} sub={`฿${fmtBaht(stats.totalNotComp)}`} barColor="#dc2626" bar={stats.total?stats.notComp/stats.total:0}/>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <SummaryCard title="สรุปบริการตรวจคัดกรองไวรัสตับอักเสบ บี" rows={hepRows.filter(r=>isHepB(r.service_name))} color="#2563eb" bgColor="#eff6ff"/>
        <SummaryCard title="สรุปบริการตรวจคัดกรองไวรัสตับอักเสบ ซี" rows={hepRows.filter(r=>isHepC(r.service_name))} color="#0891b2" bgColor="#ecfeff"/>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full bg-indigo-500"/>
            <div className="font-bold text-gray-900 text-[13.5px]">รายการบริการตับอักเสบ</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {[['all','ทั้งหมด'],['hepB','ตับอักเสบ บี'],['hepC','ตับอักเสบ ซี']].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>{setFType(v);setPage(1)}}
                  className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',filterType===v?'bg-white font-bold text-blue-600 shadow-sm':'text-gray-500 hover:text-blue-500')}>{l}</button>
              ))}
            </div>
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
              {[['all','ทั้งหมด'],['ชดเชย','ชดเชย'],['ไม่ชดเชย','ไม่ชดเชย']].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>{setFStatus(v);setPage(1)}}
                  className={cn('px-3 py-1 text-[12px] font-medium rounded-md transition-all',filterStatus===v?'bg-white font-bold text-blue-600 shadow-sm':'text-gray-500 hover:text-blue-500')}>{l}</button>
              ))}
            </div>
            {/* HSEND multi-select */}
            <div className="relative">
              <select
                className="pl-3 pr-8 py-2 text-[12px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 appearance-none cursor-pointer"
                value=""
                onChange={e => {
                  const val = e.target.value
                  if (!val) return
                  setFHsend(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val])
                  setPage(1)
                }}
              >
                <option value="">หน่วยบริการ (HSEND){filterHsend.length > 0 ? ` ✓${filterHsend.length}` : ''}</option>
                {stats.hsendOptions.map(h => (
                  <option key={h} value={h}>
                    {filterHsend.includes(h) ? '✓ ' : ''}{h}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"><path d="M4 6l4 4 4-4"/></svg>
            </div>
            {/* HSEND selected chips */}
            {filterHsend.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {filterHsend.map(h => (
                  <span key={h} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-[11px] font-semibold">
                    {h}
                    <button type="button" onClick={() => { setFHsend(prev => prev.filter(v => v !== h)); setPage(1) }}
                      className="w-3.5 h-3.5 rounded-full bg-blue-200 hover:bg-blue-300 flex items-center justify-center text-[9px] transition-all">✕</button>
                  </span>
                ))}
                <button type="button" onClick={() => { setFHsend([]); setPage(1) }}
                  className="text-[11px] text-gray-400 hover:text-red-500 transition-all px-1">ล้าง</button>
              </div>
            )}
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
              {pageRows.length===0?(
                <tr><td colSpan={12} className="text-center py-16 text-gray-400"><div className="text-3xl mb-3 opacity-40">🔍</div><div className="text-[13px]">ไม่พบข้อมูล</div></td></tr>
              ):pageRows.map((r,i)=>(
                <tr key={r.id??`${r.trans_id}-${r.item_seq}-${i}`} className="border-b border-gray-100 hover:bg-blue-50/50 transition-all even:bg-gray-50/30">
                  <td className="px-3 py-2.5 text-gray-400 font-mono text-[11px]">{(page-1)*PG+i+1}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-gray-600 whitespace-nowrap">{r.rep_no}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-gray-400">{r.pid}</td>
                  <td className="px-3 py-2.5"><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',r.rights==='UCS'?'bg-blue-100 text-blue-700':r.rights==='SSS'?'bg-orange-100 text-orange-700':r.rights==='WEL'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-600')}>{r.rights||'—'}</span></td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.service_date}</td>
                  <td className="px-3 py-2.5 text-gray-400 text-[11px] whitespace-nowrap">{r.send_date}</td>
                  <td className="px-3 py-2.5"><span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold',isHepB(r.service_name)?'bg-blue-50 text-blue-700 border border-blue-200':isHepC(r.service_name)?'bg-cyan-50 text-cyan-700 border border-cyan-200':'bg-gray-50 text-gray-600')}>{isHepB(r.service_name)?'🟦':isHepC(r.service_name)?'🔵':''}<span className="truncate max-w-[220px]">{r.service_name}</span></span></td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold text-gray-700">{r.total_claim>0?fmtBaht(r.total_claim):'—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[11.5px] font-bold"><span className={r.compensated>0?'text-emerald-600':'text-gray-300'}>{r.compensated>0?fmtBaht(r.compensated):'—'}</span></td>
                  <td className="px-3 py-2.5 text-center"><span className={cn('px-2.5 py-1 rounded-full text-[10.5px] font-bold',r.status==='ชดเชย'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-600')}>{r.status==='ชดเชย'?'✓ ชดเชย':'✕ ไม่ชดเชย'}</span></td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-400 max-w-[200px]"><span className="truncate block" title={r.note_other||r.note}>{r.note_other?(r.note_other.split('##')[1]||r.note_other):r.note||'—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages>1&&(
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

function KpiCard({icon,label,val,sub,sub2,bar,barColor}:{icon:string;label:string;val:string;sub:string;sub2?:string;bar:number;barColor:string}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{background:barColor}}/>
      <div className="text-2xl mb-3">{icon}</div>
      <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">{label}</div>
      <div className="text-[22px] font-black text-gray-900 mb-0.5">{val}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
      {sub2&&<div className="text-[12px] font-bold mt-1" style={{color:barColor}}>{sub2}</div>}
      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{width:`${Math.min(bar*100,100)}%`,background:barColor}}/></div>
    </div>
  )
}

function SummaryCard({title,rows,color,bgColor}:{title:string;rows:SeamlessRow[];color:string;bgColor:string}) {
  const comp=rows.filter(r=>r.status==='ชดเชย'),notComp=rows.filter(r=>r.status==='ไม่ชดเชย')
  const pct=rows.length?(comp.length/rows.length*100):0
  const reasons:Record<string,number>={}
  for(const r of notComp){const raw=r.note_other?(r.note_other.split('##')[1]||r.note_other).trim():r.note||'ไม่ระบุ';const key=raw.length>55?raw.slice(0,55)+'…':raw;reasons[key]=(reasons[key]||0)+1}
  const top=Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,3)
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4"><div className="w-2 h-2 rounded-full" style={{background:color}}/><div className="font-bold text-gray-900 text-[13px]">{title}</div></div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-3 rounded-xl" style={{background:bgColor}}><div className="text-[20px] font-black" style={{color}}>{fmtNum(rows.length)}</div><div className="text-[10px] text-gray-500">รายการทั้งหมด</div></div>
        <div className="text-center p-3 rounded-xl bg-emerald-50"><div className="text-[20px] font-black text-emerald-600">{fmtNum(comp.length)}</div><div className="text-[10px] text-gray-500">ชดเชยแล้ว</div></div>
        <div className="text-center p-3 rounded-xl bg-red-50"><div className="text-[20px] font-black text-red-600">{fmtNum(notComp.length)}</div><div className="text-[10px] text-gray-500">ไม่ชดเชย</div></div>
      </div>
      <div className="mb-3">
        <div className="flex justify-between text-[11.5px] mb-1"><span className="text-gray-500">อัตราชดเชย</span><span className="font-bold" style={{color}}>{pct.toFixed(1)}%</span></div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${pct}%`,background:color}}/></div>
      </div>
      <div className="text-[12px] font-bold text-emerald-700 mb-3">ยอดชดเชยรวม: ฿{fmtBaht(comp.reduce((a,b)=>a+b.compensated,0))}</div>
      {top.length>0&&(<div><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">สาเหตุไม่ชดเชยที่พบบ่อย</div>
        {top.map(([r,c],i)=>(<div key={i} className="flex items-start gap-2 mb-1.5"><span className="text-[10px] font-bold text-red-400 mt-0.5 flex-shrink-0">✕</span><span className="text-[11px] text-gray-600 leading-tight flex-1">{r}</span><span className="text-[10px] font-bold text-gray-400 flex-shrink-0">{c} ครั้ง</span></div>))}
      </div>)}
    </div>
  )
}

function StatChip({dot,label,val,unit}:{dot:string;label:string;val:string;unit:string}) {
  return <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{background:dot}}/><span className="text-gray-500">{label}</span><span className="font-bold text-gray-800">{val}</span>{unit&&<span className="text-gray-400">{unit}</span>}</div>
}

function exportCsv(rows:SeamlessRow[]) {
  const h=['ลำดับ','REP No.','Trans ID','HN','PID','ชื่อ-สกุล','สิทธิ','หน่วยบริการ','วันที่ส่ง','วันที่บริการ','รายการบริการ','จำนวน','ราคา','ขอเบิกรวม','ชดเชย','ไม่ชดเชย','สถานะ','หมายเหตุ','ไฟล์']
  const d=rows.map((r,i)=>[i+1,r.rep_no,r.trans_id,r.hn,r.pid,r.name,r.rights,r.hmain,r.send_date,r.service_date,r.service_name,r.qty,r.price,r.total_claim,r.compensated,r.not_comp,r.status,(r.note_other?(r.note_other.split('##')[1]||r.note_other):r.note)||'',r.source_file].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','))
  const b=new Blob(['\uFEFF'+[h.join(','),...d].join('\n')],{type:'text/csv;charset=utf-8;'})
  const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`seamless_${new Date().toISOString().split('T')[0]}.csv`;a.click();URL.revokeObjectURL(u)
}