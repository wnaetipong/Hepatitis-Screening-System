'use client'
import { useMemo } from 'react'
import type { VillageRow, ScreeningDB, AppConfig } from '@/types'
import { isScreened, fmtNum, pctClass } from '@/lib/utils'

interface Props {
  village: Record<string, VillageRow[]>
  db: ScreeningDB
  cfg: AppConfig
}

export function KpiCards({ village, db, cfg }: Props) {
  const stats = useMemo(() => {
    const allRows = Object.values(village).flat()
    const total = allRows.length
    let hb = 0, hcv = 0
    for (const r of allRows) {
      if (isScreened(db, r.pid, 'HBsAg',   'all')) hb++
      if (isScreened(db, r.pid, 'AntiHCV', 'all')) hcv++
    }
    const mooCount = Object.keys(village).length
    return { total, hb, hcv, mooCount,
      hbPct:  total ? +(hb  / total * 100).toFixed(2) : 0,
      hcvPct: total ? +(hcv / total * 100).toFixed(2) : 0,
    }
  }, [village, db])

  return (
    <div className="grid grid-cols-3 gap-4 mb-5">
      {/* Total */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm animate-fade-up [animation-delay:50ms]">
        <div className="absolute-none" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl bg-gradient-to-r from-slate-400 to-slate-500" />
        </div>
        <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="w-5 h-5">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1.5">กลุ่มเป้าหมายทั้งหมด</div>
        <div className="text-4xl font-black text-gray-900 mb-1">{fmtNum(stats.total)}</div>
        <div className="text-xs text-gray-400">{stats.mooCount} หมู่บ้าน · ข้อมูล ณ วันนี้</div>
        <div className="mt-4 h-1.5 bg-gray-100 rounded-full" />
      </div>

      {/* HBsAg */}
      <KpiCard
        label="คัดกรอง HBsAg (ไวรัสตับอักเสบ บี)"
        count={stats.hb}
        total={stats.total}
        pct={stats.hbPct}
        color={cfg.hbColor}
        accentFrom={cfg.hbColor}
        accentTo="#10b981"
        iconColor="#2563eb"
        delay={100}
      />

      {/* Anti-HCV */}
      <KpiCard
        label="คัดกรอง Anti-HCV (ไวรัสตับอักเสบ ซี)"
        count={stats.hcv}
        total={stats.total}
        pct={stats.hcvPct}
        color={cfg.hcvColor}
        accentFrom={cfg.hcvColor}
        accentTo="#f59e0b"
        iconColor="#059669"
        delay={150}
      />
    </div>
  )
}

function KpiCard({
  label, count, total, pct, color, accentFrom, accentTo, iconColor, delay,
}: {
  label: string; count: number; total: number; pct: number
  color: string; accentFrom: string; accentTo: string; iconColor: string; delay: number
}) {
  const cls = pctClass(pct)
  return (
    <div
      className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm animate-fade-up relative overflow-hidden"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
        style={{ background: `linear-gradient(90deg, ${accentFrom}, ${accentTo})` }}
      />
      <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" className="w-5 h-5">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
      </div>
      <div className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1.5">{label}</div>
      <div className="text-4xl font-black text-gray-900 mb-1">{fmtNum(count)}</div>
      <div className="text-xs text-gray-400">จากกลุ่มเป้าหมาย {fmtNum(total)} ราย</div>
      <div className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full
        ${cls === 'high' ? 'bg-emerald-100 text-emerald-800' : cls === 'mid' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
        {pct}%
      </div>
      <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-[1200ms] ease-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}
