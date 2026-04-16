'use client'
import { useState, useMemo, useCallback } from 'react'
import type { VillageRow, ScreeningDB, TableRow, AppConfig, ScreeningType } from '@/types'
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
  onVillageChanged?: () => void
  onScreeningChanged?: () => void
}

const PG_OPTIONS = [25, 50, 100, 200]

// ── ScreeningEntry สำหรับแก้ไขใน modal ───────────────────────────
interface ScreeningEntry { year: string; date: string; unit: string }

export function DataTable({ village, db, cfg, activeMoo, onSelectMoo, onVillageChanged, onScreeningChanged }: Props) {
  const [search, setSearch]       = useState('')
  const [scr, setScr]             = useState('all')
  const [gender, setGender]       = useState('all')
  const [year, setYear]           = useState('all')
  const [pg, setPg]               = useState(50)
  const [page, setPage]           = useState(1)
  const [sortCol, setSortCol]     = useState('no')
  const [sortDir, setSortDir]     = useState(1)
  const [modal, setModal]         = useState<TableRow | null>(null)
  const [editRow, setEditRow]     = useState<TableRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<TableRow | null>(null)
  const [saving, setSaving]       = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const moos = sortMoos(Object.keys(village))

  const allYears = useMemo(() => {
    const ys = new Set<string>()
    for (const t of ['HBsAg', 'AntiHCV'] as const)
      for (const y of Object.keys(db[t])) ys.add(y)
    return [...ys].sort()
  }, [db])

  const allRows = useMemo((): TableRow[] => {
    const mooList = activeMoo === 'all' ? moos : [activeMoo]
    const result: TableRow[] = []
    for (const m of mooList) {
      for (const r of village[m] ?? []) result.push({ ...r, moo: m })
    }
    return result
  }, [village, activeMoo, moos])

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
        av = parseInt(String(av)) || 0; bv = parseInt(String(bv)) || 0
      } else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase() }
      return av < bv ? -sortDir : av > bv ? sortDir : 0
    })
    return rows
  }, [allRows, search, scr, gender, year, db, sortCol, sortDir])

  const totalPages = Math.ceil(filtered.length / pg)
  const pageRows   = filtered.slice((page - 1) * pg, page * pg)

  const handleSort = useCallback((col: string) => {
    setSortDir(prev => sortCol === col ? prev * -1 : 1)
    setSortCol(col); setPage(1)
  }, [sortCol])

  const handleFilter = useCallback(() => setPage(1), [])

  // ── Save village info ──────────────────────────────────────────
  const handleSaveVillage = useCallback(async (updated: TableRow) => {
    if (!updated.id) return
    setSaving(true)
    try {
      const res = await fetch('/api/village', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: updated.id, row: updated }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
    } catch (e) {
      showToast(`เกิดข้อผิดพลาด: ${String(e)}`, false)
      setSaving(false)
      throw e
    }
    setSaving(false)
  }, [showToast])

  // ── Save screening entries ─────────────────────────────────────
  const handleSaveScreening = useCallback(async (
    pid: string,
    type: ScreeningType,
    entries: ScreeningEntry[],
  ) => {
    // ส่ง request ทีละปี
    const promises = entries.map(entry =>
      fetch('/api/screening', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, type, year: entry.year, date: entry.date, unit: entry.unit }),
      }).then(r => r.json())
    )
    const results = await Promise.all(promises)
    const failed = results.find(r => !r.ok)
    if (failed) throw new Error(failed.error)
  }, [])

  // ── Combined save (village + screening) ───────────────────────
  const handleSaveAll = useCallback(async (
    updated: TableRow,
    hbEntries: ScreeningEntry[],
    hcvEntries: ScreeningEntry[],
  ) => {
    setSaving(true)
    try {
      await handleSaveVillage(updated)
      await handleSaveScreening(updated.pid, 'HBsAg',   hbEntries)
      await handleSaveScreening(updated.pid, 'AntiHCV', hcvEntries)
      showToast('✓ บันทึกข้อมูลเรียบร้อยแล้ว', true)
      setEditRow(null)
      onVillageChanged?.()
      onScreeningChanged?.()
    } catch (e) {
      showToast(`เกิดข้อผิดพลาด: ${String(e)}`, false)
    } finally {
      setSaving(false)
    }
  }, [handleSaveVillage, handleSaveScreening, showToast, onVillageChanged, onScreeningChanged])

  // ── Confirm delete ────────────────────────────────────────────
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteRow?.id) return
    setDeleting(true)
    try {
      const res = await fetch('/api/village', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteRow.id }),
      })
      const json = await res.json()
      if (json.ok) {
        showToast('✓ ลบข้อมูลเรียบร้อยแล้ว', true)
        setDeleteRow(null)
        onVillageChanged?.()
      } else {
        showToast(`เกิดข้อผิดพลาด: ${json.error}`, false)
      }
    } catch (e) {
      showToast(`เกิดข้อผิดพลาด: ${String(e)}`, false)
    } finally {
      setDeleting(false)
    }
  }, [deleteRow, showToast, onVillageChanged])

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
    'hover:text-blue-600', sortCol === col && 'text-blue-600',
  )

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
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
            <button key={v} onClick={() => { onSelectMoo(v); setPage(1) }}
              className={cn('px-4 py-1.5 text-[12.5px] font-medium rounded-full border transition-all',
                activeMoo === v
                  ? (v === 'all' ? 'bg-indigo-600 border-indigo-600 text-white font-semibold' : 'bg-blue-600 border-blue-600 text-white font-semibold')
                  : 'bg-gray-100 border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600')}>
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
            <input className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-gray-200 rounded-lg outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm"
              placeholder="ค้นหาชื่อ นามสกุล หรือเลขบัตรประชาชน..."
              value={search} onChange={e => { setSearch(e.target.value); handleFilter() }} />
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
          <StatChip dot={cfg.hbColor}  label="HBsAg ✓"    val={fmtNum(stats.hb)}  unit={`(${stats.total ? (stats.hb/stats.total*100).toFixed(1) : 0}%)`} />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot={cfg.hcvColor} label="Anti-HCV ✓" val={fmtNum(stats.hcv)} unit={`(${stats.total ? (stats.hcv/stats.total*100).toFixed(1) : 0}%)`} />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot="#f59e0b" label="ยังไม่คัดกรอง HBsAg"    val={fmtNum(stats.total - stats.hb)}  unit="ราย" />
          <div className="w-px bg-gray-200 self-stretch" />
          <StatChip dot="#0891b2" label="ยังไม่คัดกรอง Anti-HCV" val={fmtNum(stats.total - stats.hcv)} unit="ราย" />
        </div>
      </div>

      {/* Table */}
      <div className="border-t border-gray-100 overflow-x-auto overflow-y-auto" style={{ maxHeight: '65vh' }}>
        <table className="w-full border-collapse text-[12px]" style={{ tableLayout: 'fixed', minWidth: 600 }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b-2 border-gray-100">
              {cfg.showNo      && <Th col="no"     label="ลำดับ"            sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="3.5%" />}
              {cfg.showAddr    && <Th col="addr"   label="บ้านเลขที่"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="5%" />}
              {cfg.showPrefix  && <Th col="prefix" label="คำนำหน้า"          sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="5%" />}
              {cfg.showFname   && <Th col="fname"  label="ชื่อ"              sortCol={sortCol} sortDir={sortDir} onSort={handleSort} left w="7%" />}
              {cfg.showLname   && <Th col="lname"  label="นามสกุล"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort} left w="8%" />}
              {cfg.showGender  && <Th col="gender" label="เพศ"               sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="4%" />}
              {cfg.showAge     && <Th col="age"    label="อายุ(ปี)"          sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="4%" />}
              {cfg.showAgeM   && <Th col="agem"   label="อายุ(เดือน)"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="4%" />}
              {cfg.showDob     && <Th col="dob"    label="วันเกิด"           sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="6%" />}
              {cfg.showPid     && <Th col="pid"    label="เลขที่บัตรประชาชน" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="10%" />}
              {cfg.showRight   && <Th col="right"  label="สิทธิการรักษา"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} left w="9%" />}
              {cfg.showRegis   && <Th col="regis"  label="ทะเบียนบ้าน"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} w="8%" />}
              {cfg.showHbDate  && <th className={thCls('hbsag')}  style={{width:'8%'}}>HBsAg</th>}
              {cfg.showHbUnit  && <th className={thCls('hbunit')} style={{width:'9%'}}>หน่วยตรวจ HBsAg</th>}
              {cfg.showHcvDate && <th className={thCls('hcv')}    style={{width:'8%'}}>Anti-HCV</th>}
              {cfg.showHcvUnit && <th className={thCls('hcvunit')} style={{width:'9%'}}>หน่วยตรวจ Anti-HCV</th>}
              <th className="px-2.5 py-2.5 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-center w-[5%]">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={17} className="text-center py-16 text-gray-400">
                  <div className="text-3xl mb-3 opacity-40">🔍</div>
                  <div className="text-[13px] font-medium">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</div>
                </td>
              </tr>
            ) : pageRows.map((r, i) => (
              <TableRowComp
                key={`${r.moo}-${r.pid}-${i}`}
                r={r} i={(page-1)*pg+i+1}
                db={db} year={year} cfg={cfg}
                onClick={() => setModal(r)}
                onEdit={e => { e.stopPropagation(); setEditRow(r) }}
                onDelete={e => { e.stopPropagation(); setDeleteRow(r) }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Pager page={page} total={totalPages} count={filtered.length} onPage={setPage} />

      {modal    && <PersonModal row={modal} db={db} year={year} onClose={() => setModal(null)} />}
      {editRow  && (
        <EditModal
          row={editRow}
          db={db}
          allYears={allYears}
          saving={saving}
          onClose={() => setEditRow(null)}
          onSave={handleSaveAll}
        />
      )}
      {deleteRow && (
        <DeleteConfirm
          row={deleteRow}
          deleting={deleting}
          onClose={() => setDeleteRow(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  )
}

// ── Sub components ───────────────────────────────────────────────
function Th({ col, label, sortCol, sortDir, onSort, left, w }: {
  col: string; label: string; sortCol: string; sortDir: number; onSort: (c: string) => void; left?: boolean; w?: string
}) {
  const active = sortCol === col
  return (
    <th onClick={() => onSort(col)} style={w ? { width: w } : undefined}
      className={cn('px-3 py-3 text-[9.5px] font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-all',
        left ? 'text-left' : 'text-center',
        active ? 'text-blue-600 bg-blue-50/50' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100/50')}>
      {label}{active ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

function TableRowComp({ r, i, db, year, cfg, onClick, onEdit, onDelete }: {
  r: TableRow; i: number; db: ScreeningDB; year: string
  cfg: AppConfig; onClick: () => void
  onEdit: (e: React.MouseEvent) => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const hbI  = getPidInfo(db, r.pid, 'HBsAg')
  const hcvI = getPidInfo(db, r.pid, 'AntiHCV')
  const hbD  = fmtDates(hbI.by_year,  year)
  const hcvD = fmtDates(hcvI.by_year, year)

  return (
    <tr onClick={onClick}
      className="cursor-pointer transition-all hover:bg-blue-50/70 border-b border-gray-100 group even:bg-gray-50/40">
      {cfg.showNo     && <td className="px-3 py-2.5 text-center text-[12px] text-gray-400 font-mono">{i}</td>}
      {cfg.showAddr   && <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{(r.addr || '').trim()}</td>}
      {cfg.showPrefix && <td className="px-3 py-2.5 text-center text-[12px] text-gray-500">{r.prefix}</td>}
      {cfg.showFname  && <td className="px-3 py-2.5 font-semibold text-[12px] text-gray-900">{r.fname}</td>}
      {cfg.showLname  && <td className="px-3 py-2.5 font-semibold text-[12px] text-gray-900">{r.lname}</td>}
      {cfg.showGender && <td className="px-3 py-2.5 text-center">
        <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[12px] font-semibold',
          r.gender === 'ชาย' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600')}>
          {r.gender}
        </span>
      </td>}
      {cfg.showAge    && <td className="px-3 py-2.5 text-center text-[12px] text-gray-600 font-medium">{r.age}</td>}
      {cfg.showAgeM   && <td className="px-3 py-2.5 text-center text-[12px] text-gray-400">{r.agem}</td>}
      {cfg.showDob    && <td className="px-3 py-2.5 text-[12px] text-gray-500 overflow-hidden text-ellipsis">{r.dob}</td>}
      {cfg.showPid    && <td className="px-3 py-2.5 font-mono text-[12px] text-gray-400 overflow-hidden text-ellipsis">{r.pid}</td>}
      {cfg.showRight  && <td className="px-3 py-2.5 text-[12px] text-gray-500 overflow-hidden text-ellipsis" title={r.right}>{r.right}</td>}
      {cfg.showRegis  && <td className="px-3 py-2.5 text-[12px] text-gray-400 overflow-hidden text-ellipsis" title={r.regis}>{r.regis}</td>}
      {cfg.showHbDate && (
        <td className="px-3 py-2.5 text-center">
          {hbD
            ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold font-mono bg-emerald-100 text-emerald-700 border border-emerald-200">{hbD.split(',')[0].trim()}</span>
            : <span className="text-gray-200 text-[13px]">—</span>}
        </td>
      )}
      {cfg.showHbUnit  && <td className="px-3 py-2.5 text-[12px] text-gray-500 overflow-hidden text-ellipsis" title={hbI.unit}>{hbI.unit}</td>}
      {cfg.showHcvDate && (
        <td className="px-3 py-2.5 text-center">
          {hcvD
            ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold font-mono bg-amber-100 text-amber-700 border border-amber-200">{hcvD.split(',')[0].trim()}</span>
            : <span className="text-gray-200 text-[13px]">—</span>}
        </td>
      )}
      {cfg.showHcvUnit && <td className="px-3 py-2.5 text-[12px] text-gray-500 overflow-hidden text-ellipsis" title={hcvI.unit}>{hcvI.unit}</td>}
      {/* คอลัมน์จัดการอยู่หลังสุด */}
      <td className="px-2 py-2 text-center" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <button onClick={onEdit} title="แก้ไข"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-400 hover:bg-blue-100 hover:text-blue-700 transition-all">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
              <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
            </svg>
          </button>
          <button onClick={onDelete} title="ลบ"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-red-300 hover:bg-red-100 hover:text-red-600 transition-all">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
              <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Edit Modal (ข้อมูลส่วนตัว + ผลตรวจ) ─────────────────────────
function EditModal({ row, db, allYears, saving, onClose, onSave }: {
  row: TableRow; db: ScreeningDB; allYears: string[]; saving: boolean
  onClose: () => void
  onSave: (updated: TableRow, hbEntries: ScreeningEntry[], hcvEntries: ScreeningEntry[]) => void
}) {
  const [tab, setTab]   = useState<'info' | 'screening'>('info')
  const [form, setForm] = useState<TableRow>({ ...row })

  // สร้าง initial entries จาก db
  const initEntries = (type: ScreeningType): ScreeningEntry[] => {
    const info = db[type]
    const years = Object.keys(info)
    if (!years.length) {
      // ถ้าไม่มีข้อมูลเลย ให้มี 1 row ว่าง
      const latestYear = allYears[allYears.length - 1] ?? '2569'
      return [{ year: latestYear, date: '', unit: '' }]
    }
    const entries: ScreeningEntry[] = []
    for (const y of years) {
      const pidData = info[y][row.pid]
      if (pidData) {
        entries.push({
          year: y,
          date: pidData.dates[0] ?? '',
          unit: pidData.unit ?? '',
        })
      }
    }
    return entries.length ? entries : [{ year: allYears[allYears.length - 1] ?? '2569', date: '', unit: '' }]
  }

  const [hbEntries,  setHbEntries]  = useState<ScreeningEntry[]>(() => initEntries('HBsAg'))
  const [hcvEntries, setHcvEntries] = useState<ScreeningEntry[]>(() => initEntries('AntiHCV'))

  const setEntry = (
    entries: ScreeningEntry[],
    setter: (e: ScreeningEntry[]) => void,
    idx: number,
    key: keyof ScreeningEntry,
    val: string,
  ) => {
    const next = entries.map((e, i) => i === idx ? { ...e, [key]: val } : e)
    setter(next)
  }

  const addEntry = (entries: ScreeningEntry[], setter: (e: ScreeningEntry[]) => void) => {
    const usedYears = new Set(entries.map(e => e.year))
    const nextYear = allYears.find(y => !usedYears.has(y)) ?? ''
    setter([...entries, { year: nextYear, date: '', unit: '' }])
  }

  const removeEntry = (entries: ScreeningEntry[], setter: (e: ScreeningEntry[]) => void, idx: number) => {
    if (entries.length <= 1) {
      setter([{ ...entries[0], date: '', unit: '' }])
    } else {
      setter(entries.filter((_, i) => i !== idx))
    }
  }

  const FIELDS: { key: keyof TableRow; label: string; half?: boolean }[] = [
    { key: 'prefix', label: 'คำนำหน้า', half: true },
    { key: 'gender', label: 'เพศ', half: true },
    { key: 'fname',  label: 'ชื่อ', half: true },
    { key: 'lname',  label: 'นามสกุล', half: true },
    { key: 'addr',   label: 'บ้านเลขที่', half: true },
    { key: 'moo',    label: 'หมู่บ้าน', half: true },
    { key: 'age',    label: 'อายุ (ปี)', half: true },
    { key: 'agem',   label: 'อายุ (เดือน)', half: true },
    { key: 'dob',    label: 'วันเกิด' },
    { key: 'pid',    label: 'เลขที่บัตรประชาชน' },
    { key: 'right',  label: 'สิทธิการรักษา' },
    { key: 'regis',  label: 'ทะเบียนบ้าน' },
  ]

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[580px] max-h-[90vh] flex flex-col animate-modal-in">

        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-t-2xl relative flex-shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-all">✕</button>
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-3 py-1 rounded-full mb-2 bg-blue-100 text-blue-700 uppercase tracking-wider">
            ✏️ แก้ไขข้อมูล
          </div>
          <div className="text-[18px] font-black text-gray-900">{row.prefix}{row.fname} {row.lname}</div>
          <div className="text-[11px] text-gray-400 font-mono mt-0.5">{row.pid} · {row.moo}</div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {([['info', '📋 ข้อมูลส่วนตัว'], ['screening', '🔬 ผลการตรวจ']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn('flex-1 py-3 text-[12.5px] font-semibold border-b-2 transition-all',
                tab === k ? 'border-blue-600 text-blue-600 bg-blue-50/40' : 'border-transparent text-gray-400 hover:text-gray-600')}>
              {l}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-5">

          {/* ── ข้อมูลส่วนตัว ── */}
          {tab === 'info' && (
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(({ key, label, half }) => (
                <div key={key} className={half ? '' : 'col-span-2'}>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">{label}</label>
                  <input
                    className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    value={String(form[key] ?? '')}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── ผลการตรวจ ── */}
          {tab === 'screening' && (
            <div className="space-y-6">
              {/* HBsAg */}
              <ScreeningSection
                label="HBsAg (ไวรัสตับอักเสบ บี)"
                color="blue"
                entries={hbEntries}
                allYears={allYears}
                onChange={(idx, key, val) => setEntry(hbEntries, setHbEntries, idx, key, val)}
                onAdd={() => addEntry(hbEntries, setHbEntries)}
                onRemove={idx => removeEntry(hbEntries, setHbEntries, idx)}
              />
              {/* Anti-HCV */}
              <ScreeningSection
                label="Anti-HCV (ไวรัสตับอักเสบ ซี)"
                color="cyan"
                entries={hcvEntries}
                allYears={allYears}
                onChange={(idx, key, val) => setEntry(hcvEntries, setHcvEntries, idx, key, val)}
                onAdd={() => addEntry(hcvEntries, setHcvEntries)}
                onRemove={idx => removeEntry(hcvEntries, setHcvEntries, idx)}
              />
              <p className="text-[11px] text-gray-400 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠ การบันทึกจะ <b>แทนที่ข้อมูล</b>วันตรวจในปีนั้นทั้งหมด — ถ้าต้องการลบข้อมูลให้เว้นวันที่ไว้ว่าง
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-7 py-4 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl flex-shrink-0 justify-end">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 text-[12.5px] font-semibold border border-gray-200 rounded-lg text-gray-500 hover:border-gray-300 transition-all disabled:opacity-40">
            ยกเลิก
          </button>
          <button onClick={() => onSave(form, hbEntries, hcvEntries)} disabled={saving}
            className="px-5 py-2 text-[12.5px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm disabled:opacity-40 flex items-center gap-2">
            {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            บันทึกทั้งหมด
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ScreeningSection component ─────────────────────────────────
function ScreeningSection({ label, color, entries, allYears, onChange, onAdd, onRemove }: {
  label: string; color: 'blue' | 'cyan'
  entries: ScreeningEntry[]
  allYears: string[]
  onChange: (idx: number, key: keyof ScreeningEntry, val: string) => void
  onAdd: () => void
  onRemove: (idx: number) => void
}) {
  const colorMap = {
    blue: { badge: 'bg-blue-100 text-blue-700', border: 'border-blue-200', ring: 'focus:ring-blue-100 focus:border-blue-400', btn: 'text-blue-600 hover:bg-blue-50 border-blue-200' },
    cyan: { badge: 'bg-cyan-100 text-cyan-700',  border: 'border-cyan-200',  ring: 'focus:ring-cyan-100 focus:border-cyan-400',  btn: 'text-cyan-600 hover:bg-cyan-50 border-cyan-200'   },
  }[color]

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full', colorMap.badge)}>{label}</span>
        <button onClick={onAdd}
          className={cn('text-[11px] font-semibold px-3 py-1 border rounded-lg transition-all', colorMap.btn)}>
          + เพิ่มปี
        </button>
      </div>
      <div className="space-y-2.5">
        {entries.map((entry, idx) => (
          <div key={idx} className={cn('grid grid-cols-[80px_1fr_1fr_28px] gap-2 items-center p-2.5 rounded-xl border', colorMap.border, 'bg-gray-50/50')}>
            {/* ปี */}
            <div>
              <div className="text-[9px] font-bold text-gray-400 mb-1 uppercase">ปี</div>
              <select
                className={cn('w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none', colorMap.ring)}
                value={entry.year}
                onChange={e => onChange(idx, 'year', e.target.value)}>
                {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                {entry.year && !allYears.includes(entry.year) && (
                  <option value={entry.year}>{entry.year}</option>
                )}
              </select>
            </div>
            {/* วันที่ตรวจ */}
            <div>
              <div className="text-[9px] font-bold text-gray-400 mb-1 uppercase">วันที่ตรวจ (ด/ม/ปปปป)</div>
              <input
                className={cn('w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none', colorMap.ring)}
                placeholder="เช่น 21/2/2567"
                value={entry.date}
                onChange={e => onChange(idx, 'date', e.target.value)}
              />
            </div>
            {/* หน่วยตรวจ */}
            <div>
              <div className="text-[9px] font-bold text-gray-400 mb-1 uppercase">หน่วยตรวจ</div>
              <input
                className={cn('w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg outline-none', colorMap.ring)}
                placeholder="เช่น รพ.วังทรายพูน"
                value={entry.unit}
                onChange={e => onChange(idx, 'unit', e.target.value)}
              />
            </div>
            {/* ลบ */}
            <button onClick={() => onRemove(idx)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all mt-4">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
                <path d="M4 4l8 8M12 4l-8 8"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Delete Confirm ───────────────────────────────────────────────
function DeleteConfirm({ row, deleting, onClose, onConfirm }: {
  row: TableRow; deleting: boolean
  onClose: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-6"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[420px] animate-modal-in p-7">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" className="w-6 h-6">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
          </svg>
        </div>
        <div className="text-center mb-5">
          <div className="text-[16px] font-bold text-gray-900 mb-1">ยืนยันการลบข้อมูล</div>
          <div className="text-[13px] text-gray-500">
            คุณต้องการลบข้อมูลของ <span className="font-semibold text-gray-800">{row.prefix}{row.fname} {row.lname}</span> ออกจากระบบ?
          </div>
          <div className="text-[11px] text-gray-400 font-mono mt-1">{row.pid}</div>
          <div className="text-[11px] text-red-500 mt-2 font-medium">⚠ การกระทำนี้ไม่สามารถยกเลิกได้</div>
        </div>
        <div className="flex gap-2 justify-center">
          <button onClick={onClose} disabled={deleting}
            className="px-5 py-2 text-[12.5px] font-semibold border border-gray-200 rounded-lg text-gray-500 hover:border-gray-300 transition-all disabled:opacity-40">
            ยกเลิก
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="px-5 py-2 text-[12.5px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all shadow-sm disabled:opacity-40 flex items-center gap-2">
            {deleting && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            ลบข้อมูล
          </button>
        </div>
      </div>
    </div>
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