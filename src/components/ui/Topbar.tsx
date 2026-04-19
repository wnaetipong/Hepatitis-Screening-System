'use client'
import { useState } from 'react'
import type { AppConfig } from '@/types'
import { cn } from '@/lib/utils'

interface TopbarProps {
  cfg: AppConfig
  onReload: () => void
  onSettings: () => void
}

export function Topbar({ cfg, onReload, onSettings }: TopbarProps) {
  const [reloading, setReloading] = useState(false)

  const handleReload = async () => {
    setReloading(true)
    onReload()
    setTimeout(() => setReloading(false), 1200)
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-8 flex items-center justify-between sticky top-0 z-50 shadow-sm">
      {/* Logo + Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shadow-sm flex-shrink-0">
          <span className="text-white font-black text-[14px]">WHP</span>
        </div>
        <div>
          <div className="text-[13.5px] font-black text-gray-900 leading-tight">
            ระบบติดตามการคัดกรองไวรัสตับอักเสบ บี และ ซี
          </div>
          <div className="text-[11px] text-gray-400 leading-tight">
            กลุ่มงานบริการด้านปฐมภูมิและองค์รวม · โรงพยาบาลวังทรายพูน
          </div>
        </div>
      </div>

      {/* Actions — เหลือแค่ รีโหลด + ตั้งค่า */}
      <div className="flex items-center gap-2">
        {/* รีโหลด */}
        <button
          type="button"
          onClick={handleReload}
          disabled={reloading}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold rounded-xl border transition-all',
            'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50',
            reloading && 'opacity-60 cursor-not-allowed',
          )}
        >
          <svg
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
            className={cn('w-3.5 h-3.5', reloading && 'animate-spin')}
          >
            <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" strokeLinecap="round"/>
            <path d="M13.5 2v3h-3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          รีโหลด
        </button>

        {/* ตั้งค่า */}
        <button
          type="button"
          onClick={onSettings}
          className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold rounded-xl border bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
            <circle cx="8" cy="8" r="2.5"/>
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" strokeLinecap="round"/>
          </svg>
          ตั้งค่า
        </button>
      </div>
    </header>
  )
}