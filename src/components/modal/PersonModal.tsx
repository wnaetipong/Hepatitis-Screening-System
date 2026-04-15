'use client'
import type { TableRow, ScreeningDB } from '@/types'
import { getPidInfo, cleanDate } from '@/lib/utils'

interface Props {
  row: TableRow
  db: ScreeningDB
  year: string
  onClose: () => void
}

export function PersonModal({ row, db, year, onClose }: Props) {
  const hbI  = getPidInfo(db, row.pid, 'HBsAg')
  const hcvI = getPidInfo(db, row.pid, 'AntiHCV')

  function detail(info: { by_year: Record<string, string[]>; unit: string }) {
    const ys = Object.keys(info.by_year)
    if (!ys.length) return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">ยังไม่ได้คัดกรอง</span>
    const all: string[] = []
    for (const y of ys) for (const d of info.by_year[y]) all.push(cleanDate(d))
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">✓ {all.join(', ')}</span>
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[540px] max-h-[90vh] overflow-y-auto animate-modal-in">
        {/* Header */}
        <div className="px-7 pt-6 pb-5 border-b border-gray-100 bg-gradient-to-br from-slate-50 to-blue-50 rounded-t-2xl relative">
          <button onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
            ✕
          </button>
          <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold px-3 py-1 rounded-full mb-2.5 bg-blue-100 text-blue-700 uppercase tracking-wider">
            👤 ข้อมูลผู้รับบริการ
          </div>
          <div className="text-[22px] font-black text-gray-900 tracking-tight mb-1">
            {row.prefix}{row.fname} {row.lname}
          </div>
          <div className="text-[11.5px] text-gray-400 font-mono">เลขบัตรประชาชน: {row.pid}</div>
        </div>

        <div className="px-7 py-6">
          {/* ข้อมูลส่วนตัว */}
          <SectionTitle label="ข้อมูลส่วนตัว" color="bg-blue-600" />
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Field label="หมู่บ้าน"       val={row.moo} />
            <Field label="บ้านเลขที่"     val={(row.addr || '').trim()} />
            <Field label="เพศ"            val={row.gender} />
            <Field label="อายุ"           val={`${row.age} ปี ${row.agem || 0} เดือน`} />
            <Field label="วันเกิด"        val={row.dob || '—'} />
            <Field label="สิทธิการรักษา" val={row.right || '—'} />
            <Field label="ทะเบียนบ้าน" val={row.regis || '—'} span />
          </div>

          {/* ผลการคัดกรอง */}
          <SectionTitle label="ผลการคัดกรอง" color="bg-emerald-500" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="HBsAg วันที่ตรวจ"    val={detail(hbI)} />
            <Field label="หน่วยตรวจ HBsAg"      val={hbI.unit || '—'} />
            <Field label="Anti-HCV วันที่ตรวจ"  val={detail(hcvI)} />
            <Field label="หน่วยตรวจ Anti-HCV"   val={hcvI.unit || '—'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 pb-2 border-b border-gray-100">
      <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label}
    </div>
  )
}

function Field({ label, val, span }: { label: string; val: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{label}</div>
      <div className="text-[13.5px] font-medium text-gray-800">{val}</div>
    </div>
  )
}
