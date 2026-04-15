'use client'
import { useMemo } from 'react'
import type { VillageRow, ScreeningDB, AppConfig } from '@/types'
import { isScreened, sortMoos } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Props {
  village: Record<string, VillageRow[]>
  db: ScreeningDB
  cfg: AppConfig
  activeMoo: string
  onSelect: (moo: string) => void
}

export function VillageStatCards({ village, db, cfg, activeMoo, onSelect }: Props) {
  const moos = sortMoos(Object.keys(village))

  const allStats = useMemo(() => {
    let total = 0, hb = 0, hcv = 0
    for (const rows of Object.values(village)) {
      total += rows.length
      for (const r of rows) {
        if (isScreened(db, r.pid, 'HBsAg',   'all')) hb++
        if (isScreened(db, r.pid, 'AntiHCV', 'all')) hcv++
      }
    }
    return { total, hb, hcv,
      hbPct:  total ? Math.round(hb  / total * 100) : 0,
      hcvPct: total ? Math.round(hcv / total * 100) : 0,
    }
  }, [village, db])

  return (
    <div className="grid grid-cols-7 gap-2 mb-5">
      {/* All */}
      <MooCard
        label="🏥 ทั้งหมด"
        total={allStats.total}
        hbPct={allStats.hbPct}
        hcvPct={allStats.hcvPct}
        cfg={cfg}
        active={activeMoo === 'all'}
        onClick={() => onSelect('all')}
        small
      />
      {moos.map(m => {
        const rows = village[m] ?? []
        const tot = rows.length
        let hb = 0, hcv = 0
        for (const r of rows) {
          if (isScreened(db, r.pid, 'HBsAg',   'all')) hb++
          if (isScreened(db, r.pid, 'AntiHCV', 'all')) hcv++
        }
        return (
          <MooCard
            key={m}
            label={m}
            total={tot}
            hbPct={tot ? Math.round(hb / tot * 100) : 0}
            hcvPct={tot ? Math.round(hcv / tot * 100) : 0}
            cfg={cfg}
            active={activeMoo === m}
            onClick={() => onSelect(m)}
          />
        )
      })}
    </div>
  )
}

function MooCard({ label, total, hbPct, hcvPct, cfg, active, onClick, small }: {
  label: string; total: number; hbPct: number; hcvPct: number
  cfg: AppConfig; active: boolean; onClick: () => void; small?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left p-3 rounded-xl border transition-all',
        active
          ? 'border-blue-500 bg-blue-50 shadow-[0_0_0_3px_rgba(37,99,235,0.08)]'
          : 'border-gray-200 bg-gray-50/60 hover:border-blue-300 hover:bg-blue-50/50',
      )}
    >
      <div className={cn('font-black text-gray-900 mb-0.5', small ? 'text-[13px]' : 'text-sm')}>{label}</div>
      <div className="text-[10px] text-gray-400 mb-2">{total} ราย</div>
      <div className="flex flex-col gap-1.5">
        <MiniBar pct={hbPct} color={cfg.hbColor} label="HBsAg" />
        <MiniBar pct={hcvPct} color={cfg.hcvColor} label="HCV" />
      </div>
    </button>
  )
}

function MiniBar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-bold text-gray-400 w-6 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[9px] font-bold w-6 text-right flex-shrink-0" style={{ color }}>{pct}%</span>
    </div>
  )
}
