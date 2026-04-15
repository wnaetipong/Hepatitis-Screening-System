'use client'
import { useState, useRef } from 'react'
import type { AppConfig } from '@/types'
import { DEFAULT_CONFIG } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  cfg: AppConfig
  onClose: () => void
  onSave: (cfg: AppConfig) => void
  onReset: () => void
}

const HB_PRESETS  = ['#059669', '#10b981', '#047857', '#0284c7', '#2563eb', '#4f46e5']
const HCV_PRESETS = ['#f59e0b', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#0891b2']

export function SettingsPanel({ open, cfg, onClose, onSave, onReset }: Props) {
  const [form, setForm] = useState<AppConfig>(cfg)
  const logoRef = useRef<HTMLInputElement>(null)

  // Sync form when cfg changes from outside
  const [prevCfg, setPrevCfg] = useState(cfg)
  if (prevCfg !== cfg) {
    setPrevCfg(cfg)
    setForm(cfg)
  }

  function set<K extends keyof AppConfig>(k: K, v: AppConfig[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => set('logoData', ev.target?.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function handleSave() {
    onSave(form)
    onClose()
  }

  function handleReset() {
    setForm(DEFAULT_CONFIG)
    onReset()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[60]"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div className={cn(
        'fixed top-0 right-0 h-full w-[380px] bg-white shadow-2xl z-[70] flex flex-col transition-transform duration-[350ms] ease-[cubic-bezier(.4,0,.2,1)]',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-br from-slate-50 to-blue-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" className="w-4 h-4">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </div>
            <div className="font-bold text-gray-900 text-[14px]">ตั้งค่าระบบ</div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Logo + Org */}
          <Section title="ข้อมูลองค์กร" color="bg-blue-500">
            {/* Logo */}
            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center overflow-hidden border-2 border-gray-200 flex-shrink-0 cursor-pointer hover:border-blue-400 transition-all shadow-sm"
                style={{ background: form.logoData ? '#fff' : 'linear-gradient(135deg,#2563eb,#0891b2)' }}
                onClick={() => logoRef.current?.click()}
                title="คลิกเพื่อเปลี่ยนโลโก้"
              >
                {form.logoData
                  ? <img src={form.logoData} alt="logo" className="w-16 h-16 object-cover rounded-full" />
                  : <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                }
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-bold text-gray-500 mb-1.5">โลโก้หน่วยงาน</div>
                <button
                  onClick={() => logoRef.current?.click()}
                  className="text-[12px] font-semibold px-3 py-1.5 border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 transition-all">
                  อัปโหลดรูป
                </button>
                {form.logoData && (
                  <button
                    onClick={() => set('logoData', '')}
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

          {/* HBsAg color */}
          <Section title="สีกราฟ HBsAg (ไวรัสตับอักเสบ บี)" color="bg-emerald-500">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0" style={{ background: form.hbColor }} />
              <input
                type="color"
                value={form.hbColor}
                onChange={e => set('hbColor', e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                title="เลือกสี"
              />
              <input
                className="flex-1 px-2.5 py-1.5 text-[12.5px] font-mono border border-gray-200 rounded-lg outline-none focus:border-blue-400 uppercase"
                value={form.hbColor}
                onChange={e => set('hbColor', e.target.value)}
                maxLength={7}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {HB_PRESETS.map(c => (
                <button key={c}
                  onClick={() => set('hbColor', c)}
                  className={cn(
                    'w-7 h-7 rounded-lg border-2 transition-all hover:scale-110',
                    form.hbColor === c ? 'border-gray-800 scale-110' : 'border-transparent',
                  )}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </Section>

          {/* Anti-HCV color */}
          <Section title="สีกราฟ Anti-HCV (ไวรัสตับอักเสบ ซี)" color="bg-amber-500">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg border border-gray-200 overflow-hidden flex-shrink-0" style={{ background: form.hcvColor }} />
              <input
                type="color"
                value={form.hcvColor}
                onChange={e => set('hcvColor', e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                title="เลือกสี"
              />
              <input
                className="flex-1 px-2.5 py-1.5 text-[12.5px] font-mono border border-gray-200 rounded-lg outline-none focus:border-blue-400 uppercase"
                value={form.hcvColor}
                onChange={e => set('hcvColor', e.target.value)}
                maxLength={7}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {HCV_PRESETS.map(c => (
                <button key={c}
                  onClick={() => set('hcvColor', c)}
                  className={cn(
                    'w-7 h-7 rounded-lg border-2 transition-all hover:scale-110',
                    form.hcvColor === c ? 'border-gray-800 scale-110' : 'border-transparent',
                  )}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </Section>

          {/* Display toggles */}
          <Section title="การแสดงผล" color="bg-violet-500">
            <div className="space-y-3">
              <Toggle
                label="แสดงกราฟภาพรวม"
                desc="กราฟแท่งเปรียบเทียบรายหมู่บ้าน"
                value={form.showChart}
                onChange={v => set('showChart', v)}
              />
              <Toggle
                label="แสดงการ์ดสถิติหมู่บ้าน"
                desc="การ์ดสรุปความครอบคลุมรายหมู่"
                value={form.showVilStats}
                onChange={v => set('showVilStats', v)}
              />
              <Toggle
                label="แสดง Data Label บนกราฟ"
                desc="ตัวเลขเปอร์เซ็นต์บนแท่งกราฟ"
                value={form.showDatalabel}
                onChange={v => set('showDatalabel', v)}
              />
              <Toggle
                label="แสดงคอลัมน์อายุ (เดือน)"
                desc="คอลัมน์อายุในหน่วยเดือนในตาราง"
                value={form.showAgeM}
                onChange={v => set('showAgeM', v)}
              />
              <Toggle
                label="แสดงคอลัมน์ทะเบียนบ้าน"
                desc="เลขทะเบียนบ้านในตาราง"
                value={form.showRegis}
                onChange={v => set('showRegis', v)}
              />
            </div>
          </Section>
        </div>

        {/* Footer actions */}
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
      </div>
    </>
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
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0',
          value ? 'bg-blue-600' : 'bg-gray-200',
        )}
      >
        <span className={cn(
          'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
          value ? 'translate-x-[22px]' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  )
}
