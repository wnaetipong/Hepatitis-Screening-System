'use client'
import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, LabelList, ResponsiveContainer, Cell,
} from 'recharts'
import type { VillageRow, ScreeningDB, AppConfig } from '@/types'
import { isScreened, sortMoos, computeVillageStat } from '@/lib/utils'
import { VillageStatCards } from './VillageStatCards'
import { DetailChart } from './DetailChart'

interface Props {
  village: Record<string, VillageRow[]>
  db: ScreeningDB
  cfg: AppConfig
  activeMoo: string
  onSelectMoo: (moo: string) => void
}

export function OverviewChart({ village, db, cfg, activeMoo, onSelectMoo }: Props) {
  const moos = sortMoos(Object.keys(village))

  const chartData = useMemo(() => moos.map(m => {
    const rows = village[m] ?? []
    const total = rows.length
    let hb = 0, hcv = 0
    for (const r of rows) {
      if (isScreened(db, r.pid, 'HBsAg',   'all')) hb++
      if (isScreened(db, r.pid, 'AntiHCV', 'all')) hcv++
    }
    return {
      moo: m,
      hbPct:  total ? +(hb  / total * 100).toFixed(2) : 0,
      hcvPct: total ? +(hcv / total * 100).toFixed(2) : 0,
    }
  }), [village, db, moos])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-blue-600" />
          <div>
            <div className="font-bold text-gray-900 text-[13.5px] tracking-tight">
              ภาพรวมการคัดกรองแยกรายหมู่บ้าน
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">
              {activeMoo === 'all' ? 'คลิกการ์ดหมู่บ้านเพื่อดูรายละเอียด' : `กำลังแสดง: ${activeMoo}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: cfg.hbColor }} />HBsAg
          </div>
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-gray-700">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: cfg.hcvColor }} />Anti-HCV
          </div>
        </div>
      </div>

      {/* Village stat cards */}
      {cfg.showVilStats && (
        <VillageStatCards
          village={village}
          db={db}
          cfg={cfg}
          activeMoo={activeMoo}
          onSelect={onSelectMoo}
        />
      )}

      {/* Chart area */}
      {cfg.showChart && (
        activeMoo === 'all' ? (
          <div className="h-[270px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="moo" tick={{ fontFamily: 'Sarabun', fontSize: 13, fontWeight: 600, fill: '#4b5563' }}
                  axisLine={{ stroke: '#e5e7eb' }} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`}
                  tick={{ fontFamily: 'Sarabun', fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontFamily: 'Sarabun', fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb' }}
                  formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name]}
                />
                <Bar dataKey="hbPct" name="HBsAg" fill={cfg.hbColor} radius={[6,6,0,0]} barSize={28}>
                  {cfg.showDatalabel && (
                    <LabelList dataKey="hbPct" position="top"
                      formatter={(v: number) => `${v.toFixed(1)}%`}
                      style={{ fontFamily: 'Sarabun', fontSize: 10, fontWeight: 700, fill: cfg.hbColor }} />
                  )}
                </Bar>
                <Bar dataKey="hcvPct" name="Anti-HCV" fill={cfg.hcvColor} radius={[6,6,0,0]} barSize={28}>
                  {cfg.showDatalabel && (
                    <LabelList dataKey="hcvPct" position="top"
                      formatter={(v: number) => `${v.toFixed(1)}%`}
                      style={{ fontFamily: 'Sarabun', fontSize: 10, fontWeight: 700, fill: cfg.hcvColor }} />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <DetailChart moo={activeMoo} rows={village[activeMoo] ?? []} db={db} cfg={cfg} />
        )
      )}
    </div>
  )
}
