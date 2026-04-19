'use client'
import { useState, useRef, useCallback } from 'react'
import type { AppConfig, SlotState, VilSlotState } from '@/types'
import { DEFAULT_CONFIG } from '@/types'
import { cn } from '@/lib/utils'
import { useToast } from '../ui/Toast'
import { SeamlessImportPanel } from '../seamless/SeamlessImportPanel'
import type { SummaryRow, SmtRow } from '../seamless/SeamlessImportPanel'

// ── Types ──────────────────────────────────────────────────────────
export type PanelTab = 'settings' | 'import' | 'seamless'
type ImportSubTab = 'csv' | 'vil'

interface Props {
  open: boolean
  cfg: AppConfig
  onClose: () => void
  onSave: (cfg: AppConfig) => void
  onReset: () => void
  initialTab?: PanelTab
  slots: SlotState[]
  setSlots: (s: SlotState[]) => void
  vilStatus: Record<string, VilSlotState>
  setVilStatus: React.Dispatch<React.SetStateAction<Record<string, VilSlotState>>>
  onScreeningImported: () => void
  onVillageImported: () => void
  // Seamless data (optional — ถ้าไม่ส่งมา tab Seamless จะยังใช้ local state)
  sumRows?: { fiscal_year: string; rep_no: string; b_claim: number; b_comp: number; source_file: string }[]
  smtRows?: { fiscal_year: string; transferred: number; smt_ref: string; source_file: string }[]
  onSumImported?: (rows: SummaryRow[]) => void
  onSmtImported?: (rows: SmtRow[]) => void
  onSumDeleteYear?: (year: string) => void
  onSmtDeleteYear?: (year: string) => void
}

const DEFAULT_VIL_MOOS = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.9', 'ม.14']

// ── Main Component ─────────────────────────────────────────────────
export function SettingsPanel({
  open, cfg, onClose, onSave, onReset,
  initialTab = 'settings',
  slots, setSlots,
  vilStatus, setVilStatus,
  onScreeningImported, onVillageImported,
  sumRows = [], smtRows = [],
  onSumImported, onSmtImported,
  onSumDeleteYear, onSmtDeleteYear,
}: Props) {
  const [form, setForm]             = useState<AppConfig>(cfg)
  const [panelTab, setPanelTab]     = useState<PanelTab>(initialTab)
  const [importTab, setImportTab]   = useState<ImportSubTab>('csv')
  const [loading, setLoading]       = useState<string | null>(null)
  const [vilMoos, setVilMoos]       = useState<string[]>(DEFAULT_VIL_MOOS)
  const [dragOver, setDragOver]     = useState<string | null>(null)
  const [addingYear, setAddingYear] = useState(false)
  const [newYearVal, setNewYearVal] = useState('')
  const [addingMoo, setAddingMoo]   = useState(false)
  const [newMooVal, setNewMooVal]   = useState('')
  const logoRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  const [prevCfg, setPrevCfg] = useState(cfg)
  if (prevCfg !== cfg) { setPrevCfg(cfg); setForm(cfg) }

  const [prevInitTab, setPrevInitTab] = useState(initialTab)
  if (prevInitTab !== initialTab) { setPrevInitTab(initialTab); setPanelTab(initialTab) }

  const [vilLoaded, setVilLoaded] = useState(false)
  if (open && !vilLoaded) {
    setVilLoaded(true)
    fetch('/api/village?countByMoo=1')
      .then(r => r.json())
      .then(json => {
        if (json.ok && json.data) {
          const updates: Record<string, VilSlotState> = {}
          for (const [moo, count] of Object.entries(json.data as Record<string, number>)) {
            if (count > 0) updates[moo] = { loaded: true, count }
          }
          if (Object.keys(updates).length > 0) {
            setVilStatus(prev => ({ ...updates, ...prev }))
          }
        }
      }).catch(() => {})
  }
  if (!open && vilLoaded) setVilLoaded(false)

  function set<K extends keyof AppConfig>(k: K, v: AppConfig[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const data = ev.target?.result as string
      set('logoData', data)
      try { localStorage.setItem('hepLogo', data) } catch { /* ignore */ }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleSave() { onSave(form); onClose() }
  function handleReset() {
    setForm(DEFAULT_CONFIG)
    try { localStorage.removeItem('hepLogo') } catch { /* ignore */ }
    onReset(); onClose()
  }

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
      } finally { setLoading(null) }
    }
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

  const confirmAddYear = useCallback(() => {
    const year = newYearVal.trim()
    if (!/^[0-9]{4}$/.test(year)) { showToast('กรุณาระบุปี พ.ศ. 4 หลัก (เช่น 2570)', 'err'); return }
    if (slots.some(s => s.year === year)) { showToast(`ปี ${year} มีอยู่แล้ว`, 'err'); return }
    setSlots([...slots,
      { year, type: 'HBsAg',   loaded: false, count: 0 },
      { year, type: 'AntiHCV', loaded: false, count: 0 },
    ])
    setNewYearVal(''); setAddingYear(false)
  }, [newYearVal, slots, setSlots, showToast])

  const confirmAddMoo = useCallback(() => {
    const moo = newMooVal.trim()
    if (!moo) return
    if (vilMoos.includes(moo)) { showToast(`${moo} มีอยู่แล้ว`, 'err'); return }
    setVilMoos(prev => [...prev, moo])
    setNewMooVal(''); setAddingMoo(false)
  }, [newMooVal, vilMoos, showToast])

  // ── Village Import ─────────────────────────────────────────────
  const handleVilFile = useCallback(async (file: File, moo: string) => {
    setVilStatus(prev => ({ ...prev, [moo]: { loaded: false, count: 0, loading: true } }))
    try {
      const xlsxModule = await import('xlsx')
      const XLSX = xlsxModule.default ?? xlsxModule
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const raw  = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      if (!raw.length) throw new Error('ไม่พบข้อมูลในไฟล์')

      const col = (row: Record<string, unknown>, keys: string[]): string => {
        const rk = Object.keys(row)
        for (const key of keys) {
          const f = rk.find(k => k.trim().includes(key))
          if (f !== undefined) {
            const v = row[f]
            if (v instanceof Date) {
              return `${v.getDate()}/${v.getMonth()+1}/${v.getFullYear()}`
            }
            return String(v ?? '').replace(/\t/g, '').trim()
          }
        }
        return ''
      }

      const fmtDob = (v: unknown): string => {
        if (!v || v === '') return ''
        if (v instanceof Date) {
          const y = v.getFullYear()
          const buddhistYear = y < 2400 ? y + 543 : y
          return `${v.getDate()}/${v.getMonth()+1}/${buddhistYear}`
        }
        if (typeof v === 'number' && v > 10000) {
          const d = new Date(Math.round((v - 25569) * 86400 * 1000))
          const buddhistYear = d.getUTCFullYear() + 543
          return `${d.getUTCDate()}/${d.getUTCMonth()+1}/${buddhistYear}`
        }
        const s = String(v).replace(/\t/g, '').trim()
        if (!s) return ''
        if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return s.split(' ')[0]
        try {
          const dt = new Date(s)
          if (!isNaN(dt.getTime())) {
            const buddhistYear = dt.getFullYear() + 543
            return `${dt.getDate()}/${dt.getMonth()+1}/${buddhistYear}`
          }
        } catch { /* ignore */ }
        return s.split('T')[0]
      }

      const dobKey = Object.keys(raw[0]).find(k => k.includes('วันเกิด'))

      const rows = raw.flatMap((r, idx) => {
        const pid = col(r, ['เลขที่บัตร', 'บัตรประชาชน', 'pid']).replace(/\t/g, '').trim()
        if (!pid || pid === '0' || pid.length < 10) return []
        return [{
          no:     col(r, ['ลำดับ']) || String(idx + 1),
          addr:   col(r, ['บ้านเลขที่', 'เลขที่']).trim(),
          prefix: col(r, ['คำนำหน้า', 'นำหน้า']),
          fname:  col(r, ['ชื่อ']),
          lname:  col(r, ['นามสกุล']),
          gender: col(r, ['เพศ']),
          age:    col(r, ['อายุ(ปี)', 'อายุ(ปี)', 'อายุ']),
          agem:   col(r, ['อายุ (เดือน)', 'อายุ(เดือน)']),
          dob:    dobKey ? fmtDob(r[dobKey]) : '',
          pid,
          right:  col(r, ['สิทธิ']),
          regis:  col(r, ['ทะเบียนบ้าน', 'ทะเบียน']),
          moo,
        }]
      })

      if (!rows.length) throw new Error('ไม่พบคอลัมน์ "เลขที่บัตรประชาชน" หรือข้อมูลว่างทั้งหมด')

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
      } else { throw new Error(json.error) }
    } catch (err) {
      setVilStatus(prev => ({ ...prev, [moo]: { loaded: false, count: 0, err: String(err) } }))
      showToast(`อ่านไฟล์ไม่สำเร็จ: ${String(err)}`, 'err')
    }
  }, [onVillageImported, setVilStatus, showToast])

  const handleVil = useCallback((e: React.ChangeEvent<HTMLInputElement>, moo: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    handleVilFile(file, moo)
  }, [handleVilFile])

  const years = Array.from(new Set(slots.map(s => s.year))).sort()

  // toast wrapper สำหรับ SeamlessImportPanel
  const showToastSeamless = useCallback((msg: string, ok: boolean) => {
    showToast(msg, ok ? 'ok' : 'err')
  }, [showToast])

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[60]" onClick={onClose} />
      )}

      <div className={cn(
        'fixed top-0 right-0 h-full bg-white shadow-2xl z-[70] flex flex-col',
        'transition-transform duration-[350ms] ease-[cubic-bezier(.4,0,.2,1)]',
        // seamless tab ต้องการพื้นที่กว้างกว่า
        panelTab === 'seamless' ? 'w-[640px] max-w-full' : 'w-[460px] max-w-full',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-br from-slate-50 to-blue-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" className="w-4 h-4">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-[14px]">ตั้งค่าระบบ</span>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all text-[16px]">
            ✕
          </button>
        </div>

        {/* ── Top-level tabs ── */}
        <div className="flex flex-shrink-0 border-b border-gray-100">
          {([
            { key: 'settings',  label: '⚙️ ตั้งค่าระบบ' },
            { key: 'import',    label: '📥 นำเข้าข้อมูล' },
            { key: 'seamless',  label: '📋 Seamless DMIS' },
          ] as { key: PanelTab; label: string }[]).map(({ key, label }) => (
            <button key={key} onClick={() => setPanelTab(key)}
              className={cn(
                'flex-1 py-3 text-[12.5px] font-semibold border-b-2 transition-all',
                panelTab === key
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50',
              )}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ════ Settings tab ════ */}
          {panelTab === 'settings' && (
            <div className="px-6 py-5 space-y-6">
              <Section title="ข้อมูลองค์กร" color="bg-blue-500">
                <div className="flex items-center gap-4 mb-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-200 flex-shrink-0 cursor-pointer hover:border-blue-400 transition-all shadow-sm"
                    style={{ background: form.logoData ? 'transparent' : 'linear-gradient(135deg,#2563eb,#0891b2)' }}
                    onClick={() => logoRef.current?.click()}
                    title="คลิกเพื่อเปลี่ยนโลโก้"
                  >
                    {form.logoData
                      ? <img src={form.logoData} alt="logo" className="w-full h-full object-cover" />
                      : <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                    }
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-bold text-gray-500 mb-2">โลโก้หน่วยงาน</div>
                    <button onClick={() => logoRef.current?.click()}
                      className="text-[12px] font-semibold px-3 py-1.5 border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 transition-all">
                      อัปโหลดรูป
                    </button>
                    {form.logoData && (
                      <button onClick={() => set('logoData', '')}
                        className="ml-2 text-[12px] font-semibold px-3 py-1.5 border border-gray-200 rounded-lg text-gray-400 hover:border-red-200 hover:text-red-400 transition-all">
                        ลบ
                      </button>
                    )}
                    <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
                  </div>
                </div>
                <Label>ชื่อหน่วยงาน</Label>
                <input
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 mb-3"
                  value={form.orgName}
                  onChange={e => set('orgName', e.target.value)}
                  placeholder="โรงพยาบาลวังทรายพูน"
                />
                <Label>แผนก / กลุ่มงาน</Label>
                <input
                  className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  value={form.orgDept}
                  onChange={e => set('orgDept', e.target.value)}
                  placeholder="กลุ่มงานบริการด้านปฐมภูมิและองค์รวม"
                />
              </Section>

              <Section title="สีกราฟ HBsAg (ไวรัสตับอักเสบ บี)" color="bg-emerald-500">
                <ColorPicker value={form.hbColor} onChange={c => set('hbColor', c)} />
              </Section>

              <Section title="สีกราฟ Anti-HCV (ไวรัสตับอักเสบ ซี)" color="bg-amber-500">
                <ColorPicker value={form.hcvColor} onChange={c => set('hcvColor', c)} />
              </Section>

              <Section title="การแสดงผล" color="bg-violet-500">
                <div className="space-y-3">
                  <Toggle label="แสดงกราฟภาพรวม"         desc="กราฟแท่งเปรียบเทียบรายหมู่บ้าน"    value={form.showChart}     onChange={v => set('showChart', v)} />
                  <Toggle label="แสดงการ์ดสถิติหมู่บ้าน"  desc="การ์ดสรุปความครอบคลุมรายหมู่"      value={form.showVilStats}  onChange={v => set('showVilStats', v)} />
                  <Toggle label="แสดง Data Label บนกราฟ" desc="ตัวเลขเปอร์เซ็นต์บนแท่งกราฟ"       value={form.showDatalabel} onChange={v => set('showDatalabel', v)} />
                </div>
              </Section>

              <Section title="คอลัมน์ในตาราง" color="bg-indigo-500">
                <div className="space-y-3">
                  <Toggle label="ลำดับ"              desc="คอลัมน์ลำดับที่"                  value={form.showNo}      onChange={v => set('showNo', v)} />
                  <Toggle label="บ้านเลขที่"          desc="คอลัมน์บ้านเลขที่"               value={form.showAddr}    onChange={v => set('showAddr', v)} />
                  <Toggle label="คำนำหน้า"            desc="คอลัมน์คำนำหน้าชื่อ"             value={form.showPrefix}  onChange={v => set('showPrefix', v)} />
                  <Toggle label="ชื่อ"                desc="คอลัมน์ชื่อ"                     value={form.showFname}   onChange={v => set('showFname', v)} />
                  <Toggle label="นามสกุล"             desc="คอลัมน์นามสกุล"                  value={form.showLname}   onChange={v => set('showLname', v)} />
                  <Toggle label="เพศ"                 desc="คอลัมน์เพศ"                      value={form.showGender}  onChange={v => set('showGender', v)} />
                  <Toggle label="อายุ (ปี)"           desc="คอลัมน์อายุในหน่วยปี"            value={form.showAge}     onChange={v => set('showAge', v)} />
                  <Toggle label="อายุ (เดือน)"        desc="คอลัมน์อายุในหน่วยเดือน"         value={form.showAgeM}    onChange={v => set('showAgeM', v)} />
                  <Toggle label="วันเกิด"             desc="คอลัมน์วันเกิด"                  value={form.showDob}     onChange={v => set('showDob', v)} />
                  <Toggle label="เลขที่บัตรประชาชน"   desc="คอลัมน์เลขบัตรประชาชน 13 หลัก"  value={form.showPid}     onChange={v => set('showPid', v)} />
                  <Toggle label="สิทธิการรักษา"       desc="คอลัมน์สิทธิการรักษา"            value={form.showRight}   onChange={v => set('showRight', v)} />
                  <Toggle label="ทะเบียนบ้าน"         desc="คอลัมน์เลขทะเบียนบ้าน"           value={form.showRegis}   onChange={v => set('showRegis', v)} />
                  <Toggle label="HBsAg วันที่ตรวจ"   desc="คอลัมน์วันที่ตรวจ HBsAg"         value={form.showHbDate}  onChange={v => set('showHbDate', v)} />
                  <Toggle label="หน่วยตรวจ HBsAg"    desc="คอลัมน์หน่วยตรวจ HBsAg"          value={form.showHbUnit}  onChange={v => set('showHbUnit', v)} />
                  <Toggle label="Anti-HCV วันที่ตรวจ" desc="คอลัมน์วันที่ตรวจ Anti-HCV"     value={form.showHcvDate} onChange={v => set('showHcvDate', v)} />
                  <Toggle label="หน่วยตรวจ Anti-HCV"  desc="คอลัมน์หน่วยตรวจ Anti-HCV"      value={form.showHcvUnit} onChange={v => set('showHcvUnit', v)} />
                </div>
              </Section>
            </div>
          )}

          {/* ════ Import tab ════ */}
          {panelTab === 'import' && (
            <div className="px-6 py-5 space-y-5">
              <div className="flex gap-1 p-1 bg-gray-100 rounded-[10px]">
                {(['csv', 'vil'] as const).map(t => (
                  <button key={t} onClick={() => setImportTab(t)}
                    className={cn(
                      'flex-1 py-2 text-[12px] font-medium rounded-lg transition-all whitespace-nowrap',
                      importTab === t ? 'bg-white font-bold text-blue-600 shadow-sm' : 'text-gray-500 hover:text-blue-500',
                    )}>
                    {t === 'csv' ? '📊 ข้อมูลคัดกรอง (CSV)' : '📋 กลุ่มเป้าหมาย (.xlsx)'}
                  </button>
                ))}
              </div>

              {importTab === 'csv' && (
                <div className="space-y-5">
                  {years.map(yr => (
                    <div key={yr}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-[10px] font-black bg-gradient-to-r from-blue-600 to-teal-500 text-white px-3 py-1 rounded-full">
                          ปี {yr}
                        </span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {slots.map((s, i) => {
                          if (s.year !== yr) return null
                          const busy   = loading === `slot-${i}`
                          const isDrag = dragOver === `slot-${i}`
                          return (
                            <div key={i}
                              onDragOver={e => { e.preventDefault(); setDragOver(`slot-${i}`) }}
                              onDragLeave={() => setDragOver(null)}
                              onDrop={e => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleCSVFile(f, i) }}
                              className={cn(
                                'border-[1.5px] rounded-xl p-3.5 transition-all relative overflow-hidden',
                                s.loaded ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50/60',
                                isDrag && 'border-blue-400 bg-blue-50/80 scale-[1.02]',
                              )}>
                              {s.loaded && <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-500 to-teal-400" />}
                              {isDrag && (
                                <div className="absolute inset-0 flex items-center justify-center bg-blue-50/90 z-10 rounded-xl">
                                  <span className="text-blue-600 text-[12px] font-bold">วางไฟล์</span>
                                </div>
                              )}
                              <div className="flex items-start justify-between mb-1">
                                <div className="font-bold text-[13px] text-gray-900">{s.type}</div>
                                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono',
                                  s.type === 'HBsAg' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700',
                                )}>{s.type === 'HBsAg' ? 'บี' : 'ซี'}</span>
                              </div>
                              <div className={cn('text-[11px] mb-2.5 min-h-[16px]',
                                s.loaded ? 'text-emerald-600 font-semibold' : 'text-gray-400',
                              )}>
                                {busy ? '⏳ กำลัง import...' : s.loaded ? `✓ ${s.count.toLocaleString()} ราย` : 'ยังไม่มีข้อมูล'}
                              </div>
                              <input type="file" accept=".csv" id={`sfi-${i}`} className="hidden" onChange={e => handleCSV(e, i)} />
                              <button disabled={busy} onClick={() => document.getElementById(`sfi-${i}`)?.click()}
                                className="w-full py-1.5 text-[11.5px] font-semibold bg-white border-[1.5px] border-gray-200 rounded-lg text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-all disabled:opacity-40">
                                {busy ? '⏳' : s.loaded ? '↺ อัปเดต' : '+ นำเข้า'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}

                  {addingYear ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus type="text" value={newYearVal}
                        onChange={e => setNewYearVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmAddYear(); if (e.key === 'Escape') { setAddingYear(false); setNewYearVal('') } }}
                        placeholder="ปี พ.ศ. (เช่น 2570)"
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-[12px] w-40 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
                      />
                      <button onClick={confirmAddYear} className="px-3 py-1.5 text-[12px] font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700">เพิ่ม</button>
                      <button onClick={() => { setAddingYear(false); setNewYearVal('') }} className="text-[12px] text-gray-400 hover:text-gray-600">ยกเลิก</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingYear(true)}
                      className="border-2 border-dashed border-gray-200 rounded-xl px-5 py-2.5 text-[12px] font-semibold text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all">
                      ＋ เพิ่มปีใหม่
                    </button>
                  )}

                  <NoteBox items={[
                    '<b>รูปแบบ CSV:</b> คอลัมน์ "หมายเลขบัตรประชาชน", "วันที่รับบริการ", "หน่วยตรวจ"',
                    '<b>Drag & Drop:</b> ลากไฟล์ .csv วางบนการ์ดได้โดยตรง',
                    '<b>ตรวจสอบซ้ำอัตโนมัติ</b> (pid + วันที่) ไม่เพิ่มข้อมูลซ้ำ',
                  ]} />
                </div>
              )}

              {importTab === 'vil' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2.5">
                    {vilMoos.map(m => {
                      const st   = vilStatus[m] ?? {}
                      const mid  = m.replace('.', '_')
                      const isDrag = dragOver === `vil-${m}`
                      return (
                        <div key={m}
                          onDragOver={e => { e.preventDefault(); setDragOver(`vil-${m}`) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={e => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files[0]; if (f) handleVilFile(f, m) }}
                          className={cn(
                            'border-[1.5px] rounded-xl p-3.5 transition-all relative overflow-hidden',
                            st.loaded  ? 'border-emerald-200 bg-emerald-50'  :
                            st.loading ? 'border-amber-200'                  :
                                         'border-gray-200 bg-gray-50/60',
                            isDrag && 'border-emerald-400 bg-emerald-50/80 scale-[1.02]',
                          )}>
                          {st.loaded && <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 to-teal-400" />}
                          {isDrag && (
                            <div className="absolute inset-0 flex items-center justify-center bg-emerald-50/90 z-10 rounded-xl">
                              <span className="text-emerald-600 text-[11px] font-bold">วางไฟล์</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[16px] font-black text-gray-900">{m}</div>
                            {st.loaded && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-mono">
                                {st.count?.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className={cn('text-[10.5px] mb-2.5 min-h-[14px] truncate',
                            st.loaded  ? 'text-emerald-600 font-semibold' :
                            st.err     ? 'text-red-500'                   :
                            st.loading ? 'text-amber-600'                 :
                                         'text-gray-400',
                          )}>
                            {st.loading ? '⏳ นำเข้า...'
                              : st.loaded ? `✓ ${st.count?.toLocaleString()} ราย`
                              : st.err    ? '✗ ผิดพลาด'
                              : 'ยังไม่มีข้อมูล'}
                          </div>
                          <input type="file" accept=".xlsx,.xls" id={`vf-${mid}`} className="hidden" onChange={e => handleVil(e, m)} />
                          <button disabled={st.loading} onClick={() => document.getElementById(`vf-${mid}`)?.click()}
                            className="w-full py-1.5 text-[11px] font-semibold bg-white border-[1.5px] border-gray-200 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 transition-all disabled:opacity-40">
                            {st.loaded ? '↺ อัพเดท' : '+ นำเข้า'}
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  {addingMoo ? (
                    <div className="flex items-center gap-2">
                      <input autoFocus type="text" value={newMooVal}
                        onChange={e => setNewMooVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmAddMoo(); if (e.key === 'Escape') { setAddingMoo(false); setNewMooVal('') } }}
                        placeholder="ชื่อหมู่บ้าน (เช่น ม.5)"
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-[12px] w-40 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                      />
                      <button onClick={confirmAddMoo} className="px-3 py-1.5 text-[12px] font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">เพิ่ม</button>
                      <button onClick={() => { setAddingMoo(false); setNewMooVal('') }} className="text-[12px] text-gray-400 hover:text-gray-600">ยกเลิก</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingMoo(true)}
                      className="border-2 border-dashed border-gray-200 rounded-xl px-5 py-2.5 text-[12px] font-semibold text-gray-400 hover:border-emerald-400 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all">
                      ＋ เพิ่มหมู่ใหม่
                    </button>
                  )}

                  <NoteBox items={[
                    '<b>รูปแบบ .xlsx:</b> คอลัมน์ ลำดับ, บ้านเลขที่, คำนำหน้า, ชื่อ, นามสกุล, เพศ, อายุ, วันเกิด, เลขบัตรประชาชน, สิทธิ',
                    '<b>Drag & Drop:</b> ลากไฟล์ .xlsx วางบนการ์ดได้โดยตรง',
                    '<b>Replace ข้อมูลเดิม</b> ทั้งหมดในหมู่นั้น',
                  ]} />
                </div>
              )}
            </div>
          )}

          {/* ════ Seamless tab ════ */}
          {panelTab === 'seamless' && (
            <div className="px-6 py-5">
              <SeamlessImportPanel
                sumRows={sumRows}
                smtRows={smtRows}
                onSumImported={onSumImported ?? (() => {})}
                onSmtImported={onSmtImported ?? (() => {})}
                onSumDeleteYear={onSumDeleteYear ?? (() => {})}
                onSmtDeleteYear={onSmtDeleteYear ?? (() => {})}
                showToast={showToastSeamless}
              />
            </div>
          )}
        </div>

        {/* ── Footer (settings tab only) ── */}
        {panelTab === 'settings' && (
          <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
            <button onClick={handleReset}
              className="px-4 py-2 text-[12.5px] font-semibold border border-gray-200 rounded-lg text-gray-400 hover:border-red-200 hover:text-red-400 transition-all mr-auto">
              รีเซ็ต
            </button>
            <button onClick={onClose}
              className="px-4 py-2 text-[12.5px] font-semibold border border-gray-200 rounded-lg text-gray-500 hover:border-gray-300 transition-all">
              ยกเลิก
            </button>
            <button onClick={handleSave}
              className="px-5 py-2 text-[12.5px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-sm">
              บันทึก
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Color Picker ───────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="w-10 h-10 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-blue-400 transition-all shadow-sm flex-shrink-0"
        style={{ background: value }}
        onClick={() => inputRef.current?.click()}
      />
      <input ref={inputRef} type="color" value={value} onChange={e => onChange(e.target.value)} className="sr-only" />
      <input
        className="flex-1 px-2.5 py-2 text-[12.5px] font-mono border border-gray-200 rounded-lg outline-none focus:border-blue-400 uppercase tracking-wider"
        value={value}
        onChange={e => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v) }}
        maxLength={7}
      />
      <button onClick={() => inputRef.current?.click()}
        className="px-3 py-2 text-[11.5px] font-semibold border border-gray-200 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-all whitespace-nowrap flex items-center gap-1.5">
        <span>🎨</span><span>เลือกสี</span>
      </button>
    </div>
  )
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
        <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
        {title}
      </div>
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold text-gray-500 mb-1.5">{children}</div>
}

function Toggle({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <div className="text-[12.5px] font-semibold text-gray-800">{label}</div>
        <div className="text-[11px] text-gray-400">{desc}</div>
      </div>
      <button onClick={() => onChange(!value)}
        className={cn('relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0', value ? 'bg-blue-600' : 'bg-gray-200')}>
        <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200', value ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

function NoteBox({ items }: { items: string[] }) {
  return (
    <div className="text-[11.5px] text-gray-500 leading-[1.85] px-4 py-3 bg-gray-50 rounded-xl border-l-[3px] border-blue-400">
      {items.map((it, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: `✦ ${it}` }} />
      ))}
    </div>
  )
}