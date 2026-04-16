'use client'
import { useState, useCallback } from 'react'
import { Topbar }        from '@/components/ui/Topbar'
import { ToastProvider } from '@/components/ui/Toast'
import { LoadingOverlay } from '@/components/ui/Loading'
import { KpiCards }      from '@/components/charts/KpiCards'
import { OverviewChart } from '@/components/charts/OverviewChart'
import { DataTable }     from '@/components/table/DataTable'
import { SettingsPanel } from '@/components/modal/SettingsPanel'
import type { PanelTab } from '@/components/modal/SettingsPanel'
import { useVillageData, useScreeningData, useConfig } from '@/hooks/useData'
import type { SlotState } from '@/types'

const INIT_SLOTS: SlotState[] = [
  { year: '2567', type: 'HBsAg',   loaded: false, count: 0 },
  { year: '2568', type: 'HBsAg',   loaded: false, count: 0 },
  { year: '2569', type: 'HBsAg',   loaded: false, count: 0 },
  { year: '2567', type: 'AntiHCV', loaded: false, count: 0 },
  { year: '2568', type: 'AntiHCV', loaded: false, count: 0 },
  { year: '2569', type: 'AntiHCV', loaded: false, count: 0 },
]

export default function DashboardPage() {
  const { data: village, loading: vLoading, reload: reloadVillage } = useVillageData()
  const { db, loading: sLoading, reload: reloadScreening }          = useScreeningData()
  const { cfg, save: saveCfg, reset: resetCfg }                     = useConfig()

  const [activeMoo,    setActiveMoo]    = useState('all')
  const [panelOpen,    setPanelOpen]    = useState(false)
  const [panelTab,     setPanelTab]     = useState<PanelTab>('settings')
  const [slots,        setSlots]        = useState<SlotState[]>(INIT_SLOTS)

  const isLoading = vLoading || sLoading

  const handleSelectMoo = useCallback((moo: string) => setActiveMoo(moo), [])

  const handleReload = useCallback(() => {
    reloadVillage()
    reloadScreening()
  }, [reloadVillage, reloadScreening])

  // เปิด panel บน tab นำเข้าข้อมูล
  const openImport = useCallback(() => {
    setPanelTab('import')
    setPanelOpen(true)
  }, [])

  // เปิด panel บน tab ตั้งค่า
  const openSettings = useCallback(() => {
    setPanelTab('settings')
    setPanelOpen(true)
  }, [])

  // Sync slot status from screening db
  const syncedSlots = slots.map(s => ({
    ...s,
    loaded: !!(db[s.type]?.[s.year] && Object.keys(db[s.type][s.year]).length > 0),
    count:  db[s.type]?.[s.year] ? Object.keys(db[s.type][s.year]).length : 0,
  }))

  return (
    <ToastProvider>
      {isLoading && <LoadingOverlay msg="กำลังโหลดข้อมูลจาก Supabase..." />}

      <Topbar
        cfg={cfg}
        onImport={openImport}
        onSettings={openSettings}
        onReload={handleReload}
      />

      <main className="max-w-[1440px] mx-auto px-8 py-7">
        {/* KPI */}
        <KpiCards village={village} db={db} cfg={cfg} />

        {/* Chart + Village cards */}
        <OverviewChart
          village={village}
          db={db}
          cfg={cfg}
          activeMoo={activeMoo}
          onSelectMoo={handleSelectMoo}
        />

        {/* Table */}
        <DataTable
          village={village}
          db={db}
          cfg={cfg}
          activeMoo={activeMoo}
          onSelectMoo={handleSelectMoo}
        />
      </main>

      {/* Settings + Import panel */}
      <SettingsPanel
        open={panelOpen}
        initialTab={panelTab}
        cfg={cfg}
        onClose={() => setPanelOpen(false)}
        onSave={saveCfg}
        onReset={resetCfg}
        slots={syncedSlots}
        setSlots={setSlots}
        onScreeningImported={reloadScreening}
        onVillageImported={reloadVillage}
      />

      {/* Footer */}
      <div className="max-w-[1440px] mx-auto px-8 pb-8">
        <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl text-[11.5px] text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]" />
            Hepatitis Screening System · โรงพยาบาลวังทรายพูน
          </div>
          <div>โหลดข้อมูลเมื่อ: {new Date().toLocaleDateString('th-TH')} {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</div>
        </div>
      </div>
    </ToastProvider>
  )
}
