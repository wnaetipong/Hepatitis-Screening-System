'use client'
import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { VillageRow, ScreeningDB, AppConfig } from '@/types'
import { isScreened, fmtNum } from '@/lib/utils'

interface Props {
  moo: string
  rows: VillageRow[]
  db: ScreeningDB
  cfg: AppConfig
}

export function DetailChart({ moo, rows, db, cfg }: Props) {
  const total = rows.length

  // ── Summary ───────────────────────────────────────────────────
  const { tHb, tHcv } = useMemo(() => {
    let tHb = 0, tHcv = 0
    for (const r of rows) {
      if (isScreened(db, r.pid, 'HBsAg',   'all')) tHb++
      if (isScreened(db, r.pid, 'AntiHCV', 'all')) tHcv++
    }
    return { tHb, tHcv }
  }, [rows, db])

  const hp = total ? +(tHb  / total * 100).toFixed(1) : 0
  const cp = total ? +(tHcv / total * 100).toFixed(1) : 0

  // ── By year ───────────────────────────────────────────────────
  const allYears = useMemo(() => {
    const ys = new Set<string>()
    for (const t of ['HBsAg', 'AntiHCV'] as const)
      for (const y of Object.keys(db[t])) ys.add(y)
    return [...ys].sort()
  }, [db])

  const byYearData = useMemo(() => allYears.map(y => {
    let hb = 0, hcv = 0
    for (const r of rows) {
      if (isScreened(db, r.pid, 'HBsAg',   y)) hb++
      if (isScreened(db, r.pid, 'AntiHCV', y)) hcv++
    }
    return { year: `ปี ${y}`, HBsAg: hb, AntiHCV: hcv }
  }).filter(d => d.HBsAg > 0 || d.AntiHCV > 0), [rows, db, allYears])

  // ── By gender ─────────────────────────────────────────────────
  const byGenderData = useMemo(() => {
    const male   = rows.filter(r => r.gender === 'ชาย')
    const female = rows.filter(r => r.gender === 'หญิง')
    const calc = (group: VillageRow[]) => {
      let hb = 0, hcv = 0
      for (const r of group) {
        if (isScreened(db, r.pid, 'HBsAg',   'all')) hb++
        if (isScreened(db, r.pid, 'AntiHCV', 'all')) hcv++
      }
      return { hbP: group.length ? +(hb/group.length*100).toFixed(1) : 0,
               hcvP: group.length ? +(hcv/group.length*100).toFixed(1) : 0 }
    }
    const m = calc(male), f = calc(female)
    return [
      { gender: `ชาย (${male.length})`,   HBsAg: m.hbP, AntiHCV: m.hcvP },
      { gender: `หญิง (${female.length})`, HBsAg: f.hbP, AntiHCV: f.hcvP },
    ]
  }, [rows, db])

  // ── By age group ──────────────────────────────────────────────
  const ageGroups = [
    { lbl: '34–39', min: 34, max: 39 },
    { lbl: '40–49', min: 40, max: 49 },
    { lbl: '50–59', min: 50, max: 59 },
    { lbl: '60–69', min: 60, max: 69 },
    { lbl: '70–79', min: 70, max: 79 },
    { lbl: '80–89', min: 80, max: 89 },
    { lbl: '90+',   min: 90, max: 999 },
  ]

  const byAgeData = useMemo(() => ageGroups.map(g => {
    const group = rows.filter(r => {
      const a = parseInt(r.age) || 0
      return a >= g.min && a <= g.max
    })
    let hb = 0, hcv = 0
    for (const r of group) {
      if (isScreened(db, r.pid, 'HBsAg',   'all')) hb++
      if (isScreened(db, r.pid, 'AntiHCV', 'all')) hcv++
    }
    return {
      age:    `${g.lbl} (${group.length})`,
      HBsAg:  group.length ? +(hb/group.length*100).toFixed(1) : 0,
      AntiHCV:group.length ? +(hcv/group.length*100).toFixed(1) : 0,
    }
  }), [rows, db])

  const chartProps = {
    margin: { top: 12, right: 4, left: 0, bottom: 0 },
  }
  const axisProps = {
    tick: { fontFamily: 'Sarabun', fontSize: 11, fill: '#6b7280' },
    axisLine: false as const,
    tickLine: false as const,
  }
  const tooltipStyle = {
    contentStyle: { fontFamily: 'Sarabun', fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb' },
  }
  const legendProps = {
    wrapperStyle: { fontFamily: 'Sarabun', fontSize: 11 },
    iconSize: 10,
  }

  return (
    <div>
      {/* Summary badges */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="font-bold text-gray-900 text-sm">{moo} — รายละเอียดการคัดกรอง</div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-gray-50 border-gray-200 text-gray-600">
            👥 กลุ่มเป้าหมาย {fmtNum(total)} ราย
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
            style={{ background: cfg.hbColor + '22', borderColor: cfg.hbColor + '66', color: cfg.hbColor }}>
            HBsAg {fmtNum(tHb)} ราย ({hp}%)
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
            style={{ background: cfg.hcvColor + '22', borderColor: cfg.hcvColor + '66', color: cfg.hcvColor }}>
            Anti-HCV {fmtNum(tHcv)} ราย ({cp}%)
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-amber-50 border-amber-200 text-amber-700">
            ⚠ ยังไม่คัดกรอง HBsAg {fmtNum(total - tHb)} ราย
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-cyan-50 border-cyan-200 text-cyan-700">
            ⚠ ยังไม่คัดกรอง Anti-HCV {fmtNum(total - tHcv)} ราย
          </span>
        </div>
      </div>

      {/* 4 sub charts */}
      <div className="grid grid-cols-2 gap-4">
        {/* By year */}
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">แยกรายปี</div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byYearData} {...chartProps}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="year" {...axisProps} tick={{ ...axisProps.tick, fontWeight: 600 }} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v} ราย`]} />
                <Legend {...legendProps} />
                <Bar dataKey="HBsAg"   fill={cfg.hbColor}  radius={[5,5,0,0]} barSize={22} />
                <Bar dataKey="AntiHCV" fill={cfg.hcvColor} radius={[5,5,0,0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By gender */}
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">แยกเพศ (%)</div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byGenderData} {...chartProps}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="gender" {...axisProps} tick={{ ...axisProps.tick, fontWeight: 600 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`]} />
                <Legend {...legendProps} />
                <Bar dataKey="HBsAg"   fill={cfg.hbColor}  radius={[5,5,0,0]} barSize={22} />
                <Bar dataKey="AntiHCV" fill={cfg.hcvColor} radius={[5,5,0,0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Coverage bars */}
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">ความครอบคลุม</div>
          <CoverageBar label="HBsAg (ไวรัสตับอักเสบ บี)"   done={tHb}  notDone={total - tHb}  total={total} color={cfg.hbColor} />
          <CoverageBar label="Anti-HCV (ไวรัสตับอักเสบ ซี)" done={tHcv} notDone={total - tHcv} total={total} color={cfg.hcvColor} />
        </div>

        {/* By age */}
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">แยกกลุ่มอายุ (%)</div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byAgeData} {...chartProps}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="age" {...axisProps} tick={{ ...axisProps.tick, fontSize: 9 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} {...axisProps} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`]} />
                <Legend {...legendProps} />
                <Bar dataKey="HBsAg"   fill={cfg.hbColor}  radius={[4,4,0,0]} barSize={16} />
                <Bar dataKey="AntiHCV" fill={cfg.hcvColor} radius={[4,4,0,0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

function CoverageBar({ label, done, notDone, total, color }: {
  label: string; done: number; notDone: number; total: number; color: string
}) {
  const pct = total ? +(done / total * 100).toFixed(1) : 0
  const notPct = total ? +(notDone / total * 100).toFixed(1) : 0
  return (
    <div className="mb-5">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[13px] font-bold text-gray-800">{label}</span>
        <span className="text-[13px] font-black" style={{ color }}>{pct}%</span>
      </div>
      <div className="h-3.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-all duration-[1200ms]" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color }} />
          คัดกรองแล้ว <b className="text-gray-700">{fmtNum(done)} ราย</b>
        </span>
        <span className="flex items-center gap-1.5 text-gray-500">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-200 inline-block" />
          ยังไม่คัดกรอง <b className="text-gray-700">{fmtNum(notDone)} ราย ({notPct}%)</b>
        </span>
      </div>
    </div>
  )
}
