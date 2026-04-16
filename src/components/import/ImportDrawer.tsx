'use client'
import { useState, useCallback } from 'react'
import type { SlotState, VilSlotState } from '@/types'
import { useToast } from '../ui/Toast'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  slots: SlotState[]
  setSlots: (s: SlotState[]) => void
  onScreeningImported: () => void
  onVillageImported: () => void
}

const DEFAULT_VIL_MOOS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.9', 'ม.14']

export function ImportDrawer({ open, onClose, slots, setSlots, onScreeningImported, onVillageImported }: Props) {
  const [tab, setTab]               = useState<'csv' | 'vil'>('csv')
  const [vilStatus, setVilStatus]   = useState<Record<string, VilSlotState>>({})
  const [loading, setLoading]       = useState<string | null>(null)
  const [vilMoos, setVilMoos]       = useState<string[]>(DEFAULT_VIL_MOOS)
  const [dragOver, setDragOver]     = useState<string | null>(null)
  const [addingYear, setAddingYear] = useState(false)
  const [newYearVal, setNewYearVal] = useState('')
  const [addingMoo, setAddingMoo]   = useState(false)
  const [newMooVal, setNewMooVal]   = useState('')
  const { showToast }               = useToast()

  // ── CSV Import ─────────────────────────────────────────────────
  const handleCSVFile = useCallback(async (file: File, idx: number) => {
    const s = slots[idx]

    const doImport = async (text: string) => {
      setLoading(`slot-${idx}`)
      try {
        const res = await fetch('/api/import/csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: s.type, year: s.year, csvText: text }),
        })
        const json = await res.json()
        if (json.ok) {
          showToast(`✓ Import สำเร็จ: เพิ่ม ${json.imported} ราย, ข้ามซ้ำ ${json.skipped} ราย`, 'ok')
          onScreeningImported()
        } else {
          showToast(`Error: ${json.error}`, 'err')
        }
      } finally {
        setLoading(null)
      }
    }

    // Try UTF-8 first, fallback to TIS-620
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const txt = ev.target?.result as string
      if (txt.includes('\uFFFD')) {
        const r2 = new FileReader()
        r2.onload = async (ev2) => doImport(ev2.target?.result as string)
        r2.readAsText(file, 'windows-874')
      } else {
        await doImport(txt)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }, [slots, onScreeningImported, showToast])

  const handleCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    handleCSVFile(file, idx)
  }, [handleCSVFile])

  // ── Add Year (inline, ไม่ใช้ prompt) ───────────────────────────
  const confirmAddYear = useCallback(() => {
    const year = newYearVal.trim()
    if (!/^[0-9]{4}$/.test(year)) {
      showToast('กรุณาระบุปี พ.ศ. 4 หลัก (เช่น 2570)', 'err')
      return
    }
    if (slots.some(s => s.year === year)) {
      showToast(`ปี ${year} มีอยู่แล้ว`, 'err')
      return
    }
    setSlots([
      ...slots,
      { year, type: 'HBsAg',   loaded: false, count: 0 },
      { year, type: 'AntiHCV', loaded: false, count: 0 },
    ])
    setNewYearVal('')
    setAddingYear(false)
  }, [newYearVal, slots, setSlots, showToast])

  // ── Add Moo (inline, ไม่ใช้ prompt) ────────────────────────────
  const confirmAddMoo = useCallback(() => {
    const moo = newMooVal.trim()
    if (!moo) return
    if (vilMoos.includes(moo)) {
      showToast(`${moo} มีอยู่แล้ว`, 'err')
      return
    }
    setVilMoos(prev => [...prev, moo])
    setNewMooVal('')
    setAddingMoo(false)
  }, [newMooVal, vilMoos, showToast])

  // ── Village Import ─────────────────────────────────────────────
  const handleVilFile = useCallback(async (file: File, moo: string) => {
    setVilStatus(prev => ({ ...prev, [moo]: { loaded: false, count: 0, loading: true } }))
    try {
      const XLSX = (await import('xlsx')).default
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array', cellDates: false })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      if (!raw.length) throw new Error('ไม่พบข้อมูลในไฟล์')

      const col = (row: Record<string, unknown>, keys: string[]): string => {
        const rk = Object.keys(row)
        for (const key of keys) {
          const f = rk.find(k => k.trim().includes(key))
          if (f) {
            const v = row[f]
            if (v instanceof Date) return `${v.getDate()}/${v.getMonth()+1}/${v.getFullYear()}`
            return String(v ?? '').trim()
          }
        }
        return ''
      }

      const fmtDob = (v: unknown): string => {
        if (!v) return ''
        if (typeof v === 'number') {
          const d = new Date(Math.round((v - 25569) * 86400 * 1000))
          return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`
        }
        const s = String(v)
        if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return s.split(' ')[0]
        try {
          const dt = new Date(s)
          if (!isNaN(dt.getTime())) return `${dt.getDate()}/${dt.getMonth()+1}/${dt.getFullYear()}`
        } catch { /* ignore */ }
        return s.split('T')[0]
      }

      const dobKey = Object.keys(raw[0]).find(k => k.includes('วันเกิด'))

      const rows = raw.flatMap((r) => {
        const pid = col(r, ['เลขที่บัตร', 'บัตรประชาชน', 'pid'])
        if (!pid || pid === '0') return []
        return [{
          no:     col(r, ['ลำดับ'])              || String(raw.indexOf(r) + 1),
          addr:   col(r, ['บ้านเลขที่', 'เลขที่']),
          prefix: col(r, ['คำนำหน้า', 'นำหน้า']),
          fname:  col(r, ['ชื่อ']),
          lname:  col(r, ['นามสกุล']),
          gender: col(r, ['เพศ']),
          age:    col(r, ['อายุ(ปี)', 'อายุ']),
          agem:   col(r, ['อายุ (เดือน)', 'อายุ(เดือน)']),
          dob:    dobKey ? fmtDob(r[dobKey]) : '',
          pid,
          right:  col(r, ['สิทธิ']),
          regis:  col(r, ['ทะเบียนบ้าน', 'ทะเบียน']),
          moo,
        }]
      })

      if (!rows.length) throw new Error('ไม่พบคอลัมน์ "เลขที่บัตรประชาชน"')

      const res  = await fetch('/api/village', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moo, rows }),
      })
      const json = await res.json()

      if (json.ok) {
        setVilStatus(prev => ({ ...prev, [moo]: { loaded: true, count: json.imported } }))
        showToast(`✓ ${moo}: นำเข้า ${json.imported} ราย`, 'ok')
        onVillageImported()
      } else {
        throw new Error(json.error)
      }
    } catch (err) {
      setVilStatus(prev => ({ ...prev, [moo]: { loaded: false, count: 0, err: String(err) } }))
      showToast(`อ่านไฟล์ไม่สำเร็จ: ${String(err)}`, 'err')
    }
  }, [onVillageImported, showToast])

  const handleVil = useCallback((e: React.ChangeEvent<HTMLInputElement>, moo: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    handleVilFile(file, moo)
  }, [handleVilFile])

  // ── Unique years from slots ────────────────────────────────────
  const years = Array.from(new Set(slots.map(s => s.year))).sort()

  return (
    <>
      {/* Backdrop — z-30, โปร่งใส, คลิกนอก drawer เพื่อปิด */}
      {open && <div className="fixed inset-0 z-30" onClick={onClose} />}

      {/* Drawer — z-40 เพื่อให้อยู่เหนือ backdrop ป้องกัน click ถูกดักจับ */}
      <div className={cn(
        'relative z-40 overflow-hidden transition-all duration-[450ms] ease-[cubic-bezier(.4,0,.2,1)]',
        open ? 'max-h-[900px] opacity-100 mb-6' : 'max-h-0 opacity-0 pointer-events-none',
      )}>
        <div className="bg-white border border-gray-200 rounded-2xl px-8 py-6 mt-6 shadow-md">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3 text-[16px] font-bold text-gray-900">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[15px]">📥</div>
              นำเข้าข้อมูล
            </div>
            <button onClick={onClose}
              className="text-[12px] font-semibold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all">
              ✕ ปิด
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 p-1 bg-gray-100 rounded-[10px] w-fit">
            {(['csv', 'vil'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn(
                  'px-5 py-2 text-[12.5px] font-medium rounded-lg transition-all whitespace-nowrap',
                  tab === t ? 'bg-white font-bold text-blue-600 shadow-sm' : 'text-gray-500 hover:text-blue-500',
                )}>
                {t === 'csv' ? '📊 ข้อมูลคัดกรอง (CSV)' : '📋 กลุ่มเป้าหมาย (.xlsx)'}
              </button>
            ))}
          </div>

          {/* ── CSV Panel ───────────────────────────────────────── */}
          {tab === 'csv' && (
            <div>
              {years.map(yr => (
                <div key={yr} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[10px] font-black bg-gradient-to-r from-blue-600 to-teal-500 text-white px-3 py-1 rounded-full">
                      ปี {yr}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {slots.map((s, i) => {
                      if (s.year !== yr) return null
                      const busy         = loading === `slot-${i}`
                      const isDragTarget = dragOver === `slot-${i}`
                      return (
                        <div key={i}
                          onDragOver={(e) => { e.preventDefault(); setDragOver(`slot-${i}`) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={(e) => {
                            e.preventDefault()
                            setDragOver(null)
                            const file = e.dataTransfer.files[0]
                            if (file) handleCSVFile(file, i)
                          }}
                          className={cn(
                            'border-[1.5px] rounded-xl p-4 transition-all relative overflow-hidden',
                            s.loaded ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50/60',
                            isDragTarget && 'border-blue-400 bg-blue-50/80 scale-[1.02]',
                          )}>
                          {s.loaded && <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 to-teal-400" />}
                          {isDragTarget && (
                            <div className="absolute inset-0 flex items-center justify-center bg-blue-50/90 z-10 rounded-xl">
                              <span className="text-blue-600 text-[12px] font-bold">วางไฟล์ที่นี่</span>
                            </div>
                          )}
                          <div className="flex items-start justify-between mb-1">
                            <div className="font-bold text-[14px] text-gray-900">{s.type}</div>
                            <span className={cn(
                              'text-[10px] font-bold px-2 py-0.5 rounded-full font-mono',
                              s.type === 'HBsAg' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700',
                            )}>{s.type === 'HBsAg' ? 'บี' : 'ซี'}</span>
                          </div>
                          <div className={cn('text-[11.5px] mb-3 min-h-[18px]', s.loaded ? 'text-emerald-600 font-semibold' : 'text-gray-400')}>
                            {busy ? '⏳ กำลัง import...' : s.loaded ? `✓ ${s.count.toLocaleString()} ราย` : 'ยังไม่มีข้อมูล'}
                          </div>
                          <input type="file" accept=".csv" id={`sfi-${i}`} className="hidden"
                            onChange={e => handleCSV(e, i)} />
                          <button
                            disabled={busy}
                            onClick={() => document.getElementById(`sfi-${i}`)?.click()}
                            className="w-full py-2 text-[12.5px] font-semibold bg-white border-[1.5px] border-gray-200 rounded-lg text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-all disabled:opacity-40">
                            {busy ? '⏳ กำลังโหลด...' : s.loaded ? '↺ อัปเดต' : '+ นำเข้า'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Add year — inline input แทน prompt() */}
              {addingYear ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    autoFocus
                    type="text"
                    value={newYearVal}
                    onChange={e => setNewYearVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  confirmAddYear()
                      if (e.key === 'Escape') { setAddingYear(false); setNewYearVal('') }
                    }}
                    placeholder="ปี พ.ศ. (เช่น 2570)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-[12.5px] w-44 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                  />
                  <button onClick={confirmAddYear}
                    className="px-4 py-2 text-[12.5px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all">
                    เพิ่ม
                  </button>
                  <button onClick={() => { setAddingYear(false); setNewYearVal('') }}
                    className="px-3 py-2 text-[12.5px] text-gray-500 hover:text-gray-700 transition-all">
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <button onClick={() => setAddingYear(true)}
                  className="border-2 border-dashed border-gray-200 rounded-xl px-6 py-3 text-[12.5px] font-semibold text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all">
                  ＋ เพิ่มปีใหม่
                </button>
              )}

              <NoteBox items={[
                '<b>รูปแบบไฟล์:</b> CSV ที่มีคอลัมน์ "หมายเลขบัตรประชาชน", "วันที่รับบริการ", "หน่วยตรวจ"',
                '<b>รองรับ Drag & Drop:</b> ลากไฟล์ .csv วางบนการ์ดได้โดยตรง',
                '<b>ระบบตรวจสอบข้อมูลซ้ำ</b> (pid + วันที่) อัตโนมัติ ไม่เพิ่มซ้ำ',
                '<b>บันทึกลง Supabase</b> ทันทีหลัง Import สำเร็จ',
              ]} />
            </div>
          )}

          {/* ── Village Panel ────────────────────────────────────── */}
          {tab === 'vil' && (
            <div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 mb-4">
                {vilMoos.map(m => {
                  const st           = vilStatus[m] ?? {}
                  const mid          = m.replace('.', '_')
                  const isDragTarget = dragOver === `vil-${m}`
                  return (
                    <div key={m}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(`vil-${m}`) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(null)
                        const file = e.dataTransfer.files[0]
                        if (file) handleVilFile(file, m)
                      }}
                      className={cn(
                        'border-[1.5px] rounded-xl p-4 transition-all relative overflow-hidden',
                        st.loaded  ? 'border-emerald-200 bg-emerald-50'  :
                        st.loading ? 'border-amber-200'                  :
                                     'border-gray-200 bg-gray-50/60',
                        isDragTarget && 'border-emerald-400 bg-emerald-50/80 scale-[1.02]',
                      )}>
                      {st.loaded && <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 to-teal-400" />}
                      {isDragTarget && (
                        <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/90 z-10 rounded-xl">
                          <span className="text-emerald-600 text-[11px] font-bold">วางไฟล์</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[18px] font-black text-gray-900">{m}</div>
                        {st.loaded && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-mono">
                            {st.count?.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className={cn('text-[11.5px] mb-3 min-h-[18px]',
                        st.loaded  ? 'text-emerald-600 font-semibold' :
                        st.err     ? 'text-red-500'                   :
                        st.loading ? 'text-amber-600'                 :
                                     'text-gray-400',
                      )}>
                        {st.loading ? '⏳ กำลังนำเข้า...'
                          : st.loaded ? `✓ ${st.count?.toLocaleString()} ราย`
                          : st.err    ? `✗ ${st.err}`
                          : 'ยังไม่มีข้อมูล'}
                      </div>
                      <input type="file" accept=".xlsx,.xls" id={`vf-${mid}`} className="hidden"
                        onChange={e => handleVil(e, m)} />
                      <button
                        disabled={st.loading}
                        onClick={() => document.getElementById(`vf-${mid}`)?.click()}
                        className="w-full py-2 text-[12.5px] font-semibold bg-white border-[1.5px] border-gray-200 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 transition-all disabled:opacity-40">
                        {st.loaded ? '↺ อัพเดท' : '+ นำเข้า .xlsx'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Add new moo — inline input แทน prompt() */}
              {addingMoo ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    autoFocus
                    type="text"
                    value={newMooVal}
                    onChange={e => setNewMooVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  confirmAddMoo()
                      if (e.key === 'Escape') { setAddingMoo(false); setNewMooVal('') }
                    }}
                    placeholder="ชื่อหมู่บ้าน (เช่น ม.5)"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-[12.5px] w-44 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                  />
                  <button onClick={confirmAddMoo}
                    className="px-4 py-2 text-[12.5px] font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all">
                    เพิ่ม
                  </button>
                  <button onClick={() => { setAddingMoo(false); setNewMooVal('') }}
                    className="px-3 py-2 text-[12.5px] text-gray-500 hover:text-gray-700 transition-all">
                    ยกเลิก
                  </button>
                </div>
              ) : (
                <button onClick={() => setAddingMoo(true)}
                  className="border-2 border-dashed border-gray-200 rounded-xl px-5 py-3 text-[12.5px] font-semibold text-gray-400 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all mt-1">
                  ＋ เพิ่มหมู่ใหม่
                </button>
              )}

              <NoteBox items={[
                '<b>รูปแบบไฟล์:</b> .xlsx แต่ละหมู่ มีคอลัมน์ ลำดับ, บ้านเลขที่, คำนำหน้า, ชื่อ, นามสกุล, เพศ, อายุ(ปี), อายุ(เดือน), วันเกิด, เลขที่บัตรประชาชน, สิทธิการรักษา',
                '<b>รองรับ Drag & Drop:</b> ลากไฟล์ .xlsx วางบนการ์ดได้โดยตรง',
                '<b>Replace ข้อมูลเดิม</b> ทั้งหมดใน Supabase สำหรับหมู่นั้น (ใช้อัพเดทได้)',
              ]} />
            </div>
          )}

        </div>
      </div>
    </>
  )
}

function NoteBox({ items }: { items: string[] }) {
  return (
    <div className="mt-4 text-[12px] text-gray-500 leading-[1.85] px-4 py-3 bg-gray-50 rounded-xl border-l-[3px] border-blue-500">
      {items.map((it, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: `✦ ${it}` }} />
      ))}
    </div>
  )
}
