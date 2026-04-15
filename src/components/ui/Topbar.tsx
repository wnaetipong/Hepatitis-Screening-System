'use client'
import { Button } from './Button'
import type { AppConfig } from '@/types'

interface TopbarProps {
  cfg: AppConfig
  onImport: () => void
  onSettings: () => void
  onReload: () => void
}

export function Topbar({ cfg, onImport, onSettings, onReload }: TopbarProps) {
  return (
    <div className="bg-white border-b border-gray-200 px-8 h-16 flex items-center justify-between sticky top-0 z-50 shadow-sm">
      {/* LEFT */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-md overflow-hidden"
          style={{ background: cfg.logoData ? '#fff' : 'linear-gradient(135deg,#2563eb,#0891b2)' }}>
          {cfg.logoData
            ? <img src={cfg.logoData} alt="logo" className="w-12 h-12 object-cover rounded-full" />
            : (
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
            )
          }
        </div>
        <div>
          <div className="text-[13.5px] font-bold text-gray-900 tracking-tight">
            ระบบติดตามการคัดกรองไวรัสตับอักเสบ บี และ ซี
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {cfg.orgDept || 'กลุ่มงานบริการด้านปฐมภูมิและองค์รวม'} · {cfg.orgName}
          </div>
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2">
        <Button variant="import" onClick={onImport}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
            <path d="M8 2v8M5 7l3 3 3-3M2 11v1a2 2 0 002 2h8a2 2 0 002-2v-1"/>
          </svg>
          นำเข้าข้อมูล
        </Button>
        <Button onClick={onReload}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
            <path d="M14 8A6 6 0 113.3 4M2 2l1.3 2 2-1.3"/>
          </svg>
          รีโหลด
        </Button>
        <Button onClick={() => window.print()}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
            <rect x="3" y="6" width="10" height="7" rx="1"/><path d="M5 6V3h6v3M5 10h6"/>
          </svg>
          พิมพ์
        </Button>
        <Button size="sm" className="px-3" onClick={onSettings}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </Button>
      </div>
    </div>
  )
}
