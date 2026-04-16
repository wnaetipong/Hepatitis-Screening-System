'use client'
import { useState, useMemo, useCallback } from 'react'
import type { VillageRow, ScreeningDB, TableRow, AppConfig } from '@/types'
import { isScreened, getPidInfo, fmtDates, sortMoos, fmtNum } from '@/lib/utils'
import { PersonModal } from '../modal/PersonModal'
import { cn } from '@/lib/utils'
import { Button } from '../ui/Button'

interface Props {
  village: Record<string, VillageRow[]>
  db: ScreeningDB
  cfg: AppConfig
  activeMoo: string
  onSelectMoo: (moo: string) => void
}

const PG_OPTIONS = [25, 50, 100, 200]

export function DataTable({ village, db, cfg, activeMoo, onSelectMoo }: Props) {
  const [search, setSearch]   = useState('')
  const [scr, setScr]         = useState('all')
  const [gender, setGender]   = useState('all')
  const [year, setYear]       = useState('all')
  const [pg, setPg]           = useState(50)
  const [page, setPage]       = useState(1)
  const [sortCol, setSortCol] = useState('no')
  const [sortDir, setSortDir] = useState(1)
  const [modal, setModal]     = useState<TableRow | null>(null)

  const moos = sortMoos(Object.keys(village))

  // All unique years from screening data
  const allYears = useMemo(() => {
    const ys = new Set<string>()
    for (const t of ['HBsAg', 'AntiHCV'] as const)
      for (const y of Object.keys(db[t])) ys.add(y)
    return [...ys].sort()
  }, [db])

  // Build flat rows for current moo
  const allRows = useMemo((): TableRow[] => {
    const mooList = activeMoo === 'all' ? moos : [activeMoo]
    const result: TableRow[] = []
    for (const m of mooList) {
      for (const r of village[m] ?? []) result.push({ ...r, moo: m })
    }
    return result
  }, [village, activeMoo, moos])

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = allRows

    if (q) rows = rows.filter(r =>
      (r.fname + r.lname).toLowerCase().includes(q) ||
      r.pid.includes(q) ||
      (r.prefix + r.fname + r.lname).toLowerCase().includes(q)
    )
    if (gender !== 'all') rows = rows.filter(r => r.gender === gender)
    if (scr === 'hb_y')    rows = rows.filter(r =>  isScreened(db, r.pid, 'HBsAg',   year))
    if (scr === 'hb_n')    rows = rows.filter(r => !isScreened(db, r.pid, 'HBsAg',   year))
    if (scr === 'hcv_y')   rows = rows.filter(r =>  isScreened(db, r.pid, 'AntiHCV', year))
    if (scr === 'hcv_n')   rows = rows.filter(r => !isScreened(db, r.pid, 'AntiHCV', year))
    if (scr === 'both_y')  rows = rows.filter(r =>  isScreened(db, r.pid, 'HBsAg', year) &&  isScreened(db, r.pid, 'AntiHCV', year))
    if (scr === 'both_n')  rows = rows.filter(r => !isScreened(db, r.pid, 'HBsAg', year) && !isScreened(db, r.pid, 'AntiHCV', year))

    rows = [...rows].sort((a, b) => {
      let av: string | number = (a as Record<string, string>)[sortCol] ?? ''
      let bv: string | number = (b as Record<string, string>)[sortCol] ?? ''
      if (['age', 'no', 'agem'].includes(sortCol)) {
        av = parseInt(String(av)) || 0
        bv = parseInt(String(bv)) || 0
      } else {
        av = String(av).toLowerCase()
        bv = String(bv).toLowerCase()
      }
      return av < bv ? -sortDir : av > bv ? sortDir : 0
    })
    return rows
  }, [allRows, search, scr, gender, year, db, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / pg)
  const pageRows   = filtered.slice((page - 1) * pg, page * pg)

  const handleSort = useCallback((col: string) => {
    setSortDir(prev => sortCol === col ? prev * -1 : 1)
    setSortCol(col)
    setPage(1)
  }, [sortCol])

  const handleFilter = useCallback(() => setPage(1), [])

  // Stats bar
  const stats = useMemo(() => {
    let hb = 0, hcv = 0
    for (const r of filtered) {
      if (isScreened(db, r.pid, 'HBsAg',   year)) hb++
      if (isScreened(db, r.pid, 'AntiHCV', year)) hcv++
    }
    return { total: filtered.length, hb, hcv }
  }, [filtered, db, year])

  const thCls = (col: string) => cn(
    'px-2.5 py-2.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 cursor-pointer select-none whitespace-nowrap transition-colors',
    'hover:text-blue-600',
    sortCol === col && 'text-blue-600',
  )

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      {/* Section header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-wrap gap-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
          <div>
            <div className="font-bold text-gray-900 text-[13.5px]">ทะเบียนรายชื่อกลุ่มเป้าหมาย</div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              แสดง {fmtNum(filtered.length)} ราย{activeMoo !== 'all' ? ` · ${activeMoo}` : ''}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="success" size="sm" onClick={() => exportXlsx(filtered, db, year)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
              <path d="M8 2v8M5 7l3 3 3-3M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1"/>
            </svg>Export XLSX
          </Button>
          <Button variant="success" size="sm" onClick={() => exportCsv(filtered, db, year)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3">
              <path d="M8 2v8M5 7l3 3 3-3M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1"/>
            </svg>Export CSV
          </Button>
        </div>
      </div>

      <div className="px-6 pt-4">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[['all', 'ทั้งหมด'], ...moos.map(m => [m, m])].map(([v, l]) => (
            <button key={v}
              onClick={() => { onSelectMoo(v); setPage(1) }}
              className={cn(
                'px-4 py-1.5 text-[12.5px] font-medium rounded-full border transition-all',
                activeMoo === v
                  ? (v === 'all' ? 'bg-indigo-600 border-indigo-600 text-white font-semibold' : 'bg-blue-600 border-blue-600 text-white font-semibold')
                  : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600',
              )}>
              {l}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2.5 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none">
              <circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/>
            </svg>
            <input
              className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm"
              placeholder="ค้นหาชื่อ นามสกุล หรือเลขบัตรประชาชน..."
              value={search}
              onChange={e => { setSearch(e.target.value); handleFilter() }}
            />
          </div>
          <select className="px-3 py-2 text-[13px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 shadow-sm"
            value={scr} onChange={e => { setScr(e.target.value); handleFilter() }}>
            <option value="all">สถานะทั้งหมด</option>
            <option value="hb_y">HBsAg: คัดกรองแล้ว</option>
            <option value="hb_n">HBsAg: ยังไม่ได้คัดกรอง</option>
            <option value="hcv_y">Anti-HCV: คัดกรองแล้ว</option>
            <option value="hcv_n">Anti-HCV: ยังไม่ได้คัดกรอง</option>
            <option value="both_y">คัดกรองแล้วทั้งคู่</option>
            <option value="both_n">ยังไม่ได้คัดกรองทั้งคู่</option>
          </select>
          <select className="px-3 py-2 text-[13px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 shadow-sm"
            value={gender} onChange={e => { setGender(e.target.value); handleFilter() }}>
            <option value="all">เพศทั้งหมด</option>
            <option value="ชาย">ชาย</option>
            <option value="หญิง">หญิง</option>
          </select>
          <select className="px-3 py-2 text-[13px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 shadow-sm"
            value={year} onChange={e => { setYear(e.target.value); handleFilter() }}>
            <option value="all">ทุกปี</option>
            {allYears.map(y => <option key={y} value={y}>ปี {y}</option>)}
          </select>
          <select className="px-3 py-2 text-[13px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 shadow-sm"
            value={pg} onChange={e => { setPg(+e.target.value); setPage(1) }}>
            {PG_OPTIONS.map(n => <option key={n} value={n}>{n} ราย/หน้า</option>)}
          </select>
        </div>

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100 mb-3 text-[12px]">
          <StatChip dot="#6b7280" label="แสดง" val={fmtNum(stats.total)} unit="ราย" />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot={cfg.hbColor}  label="HBsAg ✓"    val={fmtNum(stats.hb)}            unit={`(${stats.total ? (stats.hb/stats.total*100).toFixed(1) : 0}%)`} />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot={cfg.hcvColor} label="Anti-HCV ✓" val={fmtNum(stats.hcv)}           unit={`(${stats.total ? (stats.hcv/stats.total*100).toFixed(1) : 0}%)`} />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot="#f59e0b" label="ยังไม่คัดกรอง HBsAg"    val={fmtNum(stats.total - stats.hb)}  unit="ราย" />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot="#0891b2" label="ยังไม่คัดกรอง Anti-HCV" val={fmtNum(stats.total - stats.hcv)} unit="ราย" />
        </div>
      </div>

      {/* Table */}
      <div className="border-t border-gray-100 overflow-x-auto overflow-y-auto" style={{ maxHeight: '65vh' }}>
        <table className="w-full border-collapse text-[12px]" style={{ tableLayout: 'fixed', minWidth: 900 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b-2 border-gray-100">
              <Th col="no"     label="ลำดับ"            sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="3.5%" />
              <Th col="addr"   label="บ้านเลขที่"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="5%" />
              <Th col="prefix" label="คำนำหน้า"          sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="5%" />
              <Th col="fname"  label="ชื่อ"              sortCol={sortCol} sortDir={sortDir} onSort={handleSort} left w="7%" />
              <Th col="lname"  label="นามสกุล"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort} left w="8%" />
              <Th col="gender" label="เพศ"               sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="4%" />
              <Th col="age"    label="อายุ(ปี)"          sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="4%" />
              {cfg.showAgeM && <Th col="agem" label="อายุ(เดือน)" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="4%" />}
              <Th col="dob"    label="วันเกิด"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="6%" />
              <Th col="pid"    label="เลขที่บัตรประชาชน" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="10%" />
              <Th col="right"  label="สิทธิการรักษา"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} left w="9%" />
              {cfg.showRegis && <Th col="regis" label="ทะเบียนบ้าน" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="8%" />}
              <th className={thCls('hbsag')} style={{width:'8%'}}>HBsAg</th>
              <th className={thCls('hbunit')} style={{width:'9%'}}>หน่วยตรวจ HBsAg</th>
              <th className={thCls('hcv')} style={{width:'8%'}}>Anti-HCV</th>
              <th className={thCls('hcvunit')} style={{width:'9%'}}>หน่วยตรวจ Anti-HCV</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={15} className="text-center py-16 text-gray-400">
                  <div className="text-3xl mb-3 opacity-40">🔍</div>
                  <div className="text-[13px] font-medium">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>
                </td>
              </tr>
            ) : pageRows.map((r, i) => (
              <TableRow key={`${r.moo}-${r.pid}-${i}`} r={r} i={(page-1)*pg+i+1}
                db={db} year={year} cfg={cfg} onClick={() => setModal(r)} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <Pager page={page} total={totalPages} count={filtered.length} onPage={setPage} />

      {/* Modal */}
      {modal && <PersonModal row={modal} db={db} year={year} onClose={() => setModal(null)} />}
    </div>
  )
}

// ── Sub components ───────────────────────────────────────────────
function Th({ col, label, sortCol, sortDir, onSort, left, w }: {
  col: string; label: string; sortCol: string; sortDir: number; onSort: (c: string) => void; left?: boolean; w?: string
}) {
  const active = sortCol === col
  return (
    <th
      onClick={() => onSort(col)}
      style={w ? { width: w } : undefined}
      className={cn(
        'px-2.5 py-2.5 text-[9px] font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors',
        left ? 'text-left' : 'text-center',
        active ? 'text-blue-600' : 'text-gray-400 hover:text-blue-500',
      )}
    >
      {label}{active ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

function TableRow({ r, i, db, year, cfg, onClick }: {
  r: TableRow; i: number; db: ScreeningDB; year: string
  cfg: AppConfig; onClick: () => void
}) {
  const hbI  = getPidInfo(db, r.pid, 'HBsAg')
  const hcvI = getPidInfo(db, r.pid, 'AntiHCV')
  const hbD  = fmtDates(hbI.by_year,  year)
  const hcvD = fmtDates(hcvI.by_year, year)

  return (
    <tr onClick={onClick}
      className="cursor-pointer transition-colors hover:bg-blue-50 border-b border-gray-50 even:bg-gray-50/50 even:hover:bg-blue-50">
      <td className="px-2.5 py-2 text-center text-[11px] text-gray-400">{i}</td>
      <td className="px-2.5 py-2 text-center text-gray-500">{(r.addr || '').trim()}</td>
      <td className="px-2.5 py-2 text-center text-gray-500">{r.prefix}</td>
      <td className="px-2.5 py-2 font-semibold text-gray-900">{r.fname}</td>
      <td className="px-2.5 py-2 font-semibold text-gray-900">{r.lname}</td>
      <td className="px-2.5 py-2 text-center text-gray-500">{r.gender}</td>
      <td className="px-2.5 py-2 text-center text-gray-500">{r.age}</td>
      {cfg.showAgeM && <td className="px-2.5 py-2 text-center text-gray-400">{r.agem}</td>}
      <td className="px-2.5 py-2 text-gray-400 overflow-hidden text-ellipsis">{r.dob}</td>
      <td className="px-2.5 py-2 font-mono text-[10.5px] tracking-tight text-gray-400 overflow-hidden text-ellipsis">{r.pid}</td>
      <td className="px-2.5 py-2 text-[11px] text-gray-400 overflow-hidden text-ellipsis" title={r.right}>{r.right}</td>
      {cfg.showRegis && <td className="px-2.5 py-2 text-[10px] text-gray-400 overflow-hidden text-ellipsis" title={r.regis}>{r.regis}</td>}
      <td className="px-2.5 py-2 text-center">
        {hbD
          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-blue-100 text-blue-700">✓ {hbD.split(',')[0].trim()}</span>
          : <span className="text-gray-300 text-[11px]">—</span>}
      </td>
      <td className="px-2.5 py-2 text-[10px] text-gray-400 overflow-hidden text-ellipsis" title={hbI.unit}>{hbI.unit}</td>
      <td className="px-2.5 py-2 text-center">
        {hcvD
          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-cyan-100 text-cyan-700">✓ {hcvD.split(',')[0].trim()}</span>
          : <span className="text-gray-300 text-[11px]">—</span>}
      </td>
      <td className="px-2.5 py-2 text-[10px] text-gray-400 overflow-hidden text-ellipsis" title={hcvI.unit}>{hcvI.unit}</td>
    </tr>
  )
}

function StatChip({ dot, label, val, unit }: { dot: string; label: string; val: string; unit: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
      <span className="text-gray-500">{label}</span>
      <span className="font-bold text-gray-800">{val}</span>
      <span className="text-gray-400">{unit}</span>
    </div>
  )
}

function Pager({ page, total, count, onPage }: {
  page: number; total: number; count: number; onPage: (p: number) => void
}) {
  if (total <= 1) return null
  const s = Math.max(1, page - 3), e = Math.min(total, page + 3)
  return (
    <div className="flex items-center gap-1.5 px-6 py-4 flex-wrap border-t border-gray-100">
      <button disabled={page === 1} onClick={() => onPage(page - 1)}
        className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400 hover:text-blue-600 transition-all">‹</button>
      {s > 1 && <><button onClick={() => onPage(1)} className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all">1</button><span className="text-gray-300 text-sm">…</span></>}
      {Array.from({ length: e - s + 1 }, (_, i) => s + i).map(p => (
        <button key={p} onClick={() => onPage(p)}
          className={cn('px-3 py-1.5 text-[12px] border rounded-lg transition-all',
            p === page ? 'bg-blue-600 border-blue-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600')}>
          {p}
        </button>
      ))}
      {e < total && <><span className="text-gray-300 text-sm">…</span><button onClick={() => onPage(total)} className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all">{total}</button></>}
      <button disabled={page === total} onClick={() => onPage(page + 1)}
        className="px-3 py-1.5 text-[12px] bg-white border border-gray-200 rounded-lg text-gray-400 disabled:opacity-25 hover:border-blue-400 hover:text-blue-600 transition-all">›</button>
      <span className="text-[12px] text-gray-400 ml-2">หน้า {page} / {total} · {fmtNum(count)} ราย</span>
    </div>
  )
}

// ── Export XLSX ──────────────────────────────────────────────────
async function exportXlsx(rows: TableRow[], db: ScreeningDB, year: string) {
  const xlsxModule = await import('xlsx')
  const XLSX = xlsxModule.default ?? xlsxModule
  const headers = ['ลำดับ','หมู่','บ้านเลขที่','คำนำหน้า','ชื่อ','นามสกุล','เพศ','อายุ(ปี)','อายุ(เดือน)','วันเกิด','เลขที่บัตร','สิทธิ','ทะเบียนบ้าน','HBsAg วันที่','หน่วยตรวจ HBsAg','Anti-HCV วันที่','หน่วยตรวจ Anti-HCV']
  const data = rows.map((r, i) => {
    const hbI  = getPidInfo(db, r.pid, 'HBsAg')
    const hcvI = getPidInfo(db, r.pid, 'AntiHCV')
    const hbD  = fmtDates(hbI.by_year,  year) ?? ''
    const hcvD = fmtDates(hcvI.by_year, year) ?? ''
    return [i+1, r.moo, r.addr, r.prefix, r.fname, r.lname, r.gender, r.age, r.agem, r.dob, r.pid, r.right, r.regis, hbD, hbI.unit, hcvD, hcvI.unit]
  })
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  // Column widths
  ws['!cols'] = [6,8,10,8,12,14,6,7,9,12,18,12,14,14,14,14,14].map(w => ({ wch: w }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'กลุ่มเป้าหมาย')
  XLSX.writeFile(wb, `hepatitis_screening_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// ── Export CSV ───────────────────────────────────────────────────
function exportCsv(rows: TableRow[], db: ScreeningDB, year: string) {
  const headers = ['ลำดับ','หมู่','บ้านเลขที่','คำนำหน้า','ชื่อ','นามสกุล','เพศ','อายุ(ปี)','อายุ(เดือน)','วันเกิด','เลขที่บัตร','สิทธิ','HBsAg วันที่','หน่วยตรวจ HBsAg','Anti-HCV วันที่','หน่วยตรวจ Anti-HCV']
  const csvRows = rows.map((r, i) => {
    const hbI  = getPidInfo(db, r.pid, 'HBsAg')
    const hcvI = getPidInfo(db, r.pid, 'AntiHCV')
    const hbD  = fmtDates(hbI.by_year,  year) ?? ''
    const hcvD = fmtDates(hcvI.by_year, year) ?? ''
    return [i+1, r.moo, r.addr, r.prefix, r.fname, r.lname, r.gender, r.age, r.agem, r.dob, r.pid, r.right, hbD, hbI.unit, hcvD, hcvI.unit]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
  })
  const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `hepatitis_screening_${new Date().toISOString().split('T')[0]}.csv`
  a.click(); URL.revokeObjectURL(url)
}