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
import { SeamlessPage }  from '@/components/seamless/SeamlessPage'
import { useVillageData, useScreeningData, useConfig } from '@/hooks/useData'
import type { SlotState, VilSlotState } from '@/types'
import type { SummaryRow, SmtRow } from '@/components/seamless/SeamlessImportPanel'

// Lite types สำหรับ state ที่ page level
type SummaryRowLite = Pick<SummaryRow, 'fiscal_year'|'rep_no'|'b_claim'|'b_comp'|'source_file'>
type SmtRowLite = Pick<SmtRow, 'fiscal_year'|'transferred'|'smt_ref'|'source_file'>
import { cn } from '@/lib/utils'

const INIT_SLOTS: SlotState[] = [
  { year: '2567', type: 'HBsAg',   loaded: false, count: 0 },
  { year: '2568', type: 'HBsAg',   loaded: false, count: 0 },
  { year: '2569', type: 'HBsAg',   loaded: false, count: 0 },
  { year: '2567', type: 'AntiHCV', loaded: false, count: 0 },
  { year: '2568', type: 'AntiHCV', loaded: false, count: 0 },
  { year: '2569', type: 'AntiHCV', loaded: false, count: 0 },
]

type AppTab = 'dashboard' | 'seamless'

export default function DashboardPage() {
  const { data: village, loading: vLoading, reload: reloadVillage } = useVillageData()
  const { db, lastImported, loading: sLoading, reload: reloadScreening } = useScreeningData()
  const { cfg, save: saveCfg, reset: resetCfg } = useConfig()

  const [activeTab,  setActiveTab]  = useState<AppTab>('dashboard')
  const [activeMoo,  setActiveMoo]  = useState('all')
  const [panelOpen,  setPanelOpen]  = useState(false)
  const [panelTab,   setPanelTab]   = useState<PanelTab>('settings')
  const [slots,      setSlots]      = useState<SlotState[]>(INIT_SLOTS)
  const [vilStatus,  setVilStatus]  = useState<Record<string, VilSlotState>>({})
  // Seamless state — shared ระหว่าง SeamlessPage และ SettingsPanel
  const [sumRows,    setSumRows]    = useState<SummaryRowLite[]>([])
  const [smtRows,    setSmtRows]    = useState<SmtRowLite[]>([])

  const isLoading = vLoading || sLoading

  const handleSelectMoo = useCallback((moo: string) => setActiveMoo(moo), [])
  const handleReload    = useCallback(() => { reloadVillage(); reloadScreening() }, [reloadVillage, reloadScreening])

  // เปิด SettingsPanel ได้จากทุก tab
  const openSettings    = useCallback((tab: PanelTab = 'settings') => {
    setPanelTab(tab); setPanelOpen(true)
  }, [])

  const syncedSlots = slots.map(s => ({
    ...s,
    loaded: !!(db[s.type]?.[s.year] && Object.keys(db[s.type][s.year]).length > 0),
    count:  db[s.type]?.[s.year] ? Object.keys(db[s.type][s.year]).length : 0,
  }))

  return (
    <ToastProvider>
      {isLoading && activeTab === 'dashboard' && <LoadingOverlay msg="กำลังโหลดข้อมูลจาก Supabase..." />}

      {/* Topbar — เหลือแค่ รีโหลด + ตั้งค่า ใช้ได้ทุก tab */}
      <Topbar
        cfg={cfg}
        onReload={handleReload}
        onSettings={() => openSettings('settings')}
      />

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 px-8 sticky top-16 z-40">
        <div className="flex gap-1 max-w-[1440px] mx-auto">
          <NavTab
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
            icon="📊"
            label="Dashboard"
            sub="ติดตามการคัดกรอง"
          />
          <NavTab
            active={activeTab === 'seamless'}
            onClick={() => setActiveTab('seamless')}
            icon="🏥"
            label="Seamless DMIS"
            sub="ติดตามการจ่ายชดเชย สปสช."
            badge="สปสช."
          />
        </div>
      </div>

      {/* Page Content */}
      {activeTab === 'dashboard' && (
        <main className="max-w-[1440px] mx-auto px-8 py-7">
          <KpiCards village={village} db={db} cfg={cfg} lastImported={lastImported} />
          <OverviewChart village={village} db={db} cfg={cfg} activeMoo={activeMoo} onSelectMoo={handleSelectMoo} />
          <DataTable
            village={village} db={db} cfg={cfg}
            activeMoo={activeMoo} onSelectMoo={handleSelectMoo}
            onVillageChanged={reloadVillage} onScreeningChanged={reloadScreening}
          />
        </main>
      )}

      {activeTab === 'seamless' && (
        // ส่ง onOpenSettings เข้าไปเพื่อให้ SeamlessPage เปิด panel ได้
        <SeamlessPage
          onOpenSettings={() => openSettings('import')}
          sharedSumRows={sumRows}
          sharedSmtRows={smtRows}
          onSumRowsChange={setSumRows}
          onSmtRowsChange={setSmtRows}
          screeningDB={db}
        />
      )}

      {/* SettingsPanel — ใช้ได้ทุก tab */}
      <SettingsPanel
        open={panelOpen}
        initialTab={panelTab}
        cfg={cfg}
        onClose={() => setPanelOpen(false)}
        onSave={saveCfg}
        onReset={resetCfg}
        slots={syncedSlots}
        setSlots={setSlots}
        vilStatus={vilStatus}
        setVilStatus={setVilStatus}
        onScreeningImported={reloadScreening}
        onVillageImported={reloadVillage}
        sumRows={sumRows}
        smtRows={smtRows}
        onSumImported={rows => setSumRows(prev => {
          const ex = new Set(prev.map(r => r.rep_no))
          return [...prev, ...rows.filter(r => !ex.has(r.rep_no))]
        })}
        onSmtImported={rows => setSmtRows(prev => {
          const ex = new Set(prev.map(r => `${r.smt_ref}|${r.source_file}`))
          return [...prev, ...rows.filter(r => !ex.has(`${r.smt_ref}|${r.source_file}`))]
        })}
        onSumDeleteYear={year => setSumRows(prev => prev.filter(r => r.fiscal_year !== year))}
        onSmtDeleteYear={year => setSmtRows(prev => prev.filter(r => r.fiscal_year !== year))}
      />

      {/* Footer */}
      {activeTab === 'dashboard' && (
        <div className="max-w-[1440px] mx-auto px-8 pb-8">
          <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl text-[11.5px] text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]" />
              Hepatitis Screening System · โรงพยาบาลวังทรายพูน
            </div>
            <div>โหลดข้อมูลเมื่อ: {new Date().toLocaleDateString('th-TH')} {new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</div>
          </div>
        </div>
      )}
    </ToastProvider>
  )
}

function NavTab({ active, onClick, icon, label, sub, badge }: {
  active: boolean; onClick: () => void
  icon: string; label: string; sub: string; badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 px-5 py-3.5 text-[13px] font-medium border-b-2 transition-all',
        active
          ? 'border-blue-600 text-blue-600 bg-blue-50/40'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50',
      )}>
      <span className="text-base">{icon}</span>
      <div className="text-left">
        <div className={cn('font-bold text-[13px]', active ? 'text-blue-700' : 'text-gray-700')}>
          {label}
          {badge && (
            <span className="ml-2 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 align-middle">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-gray-400 font-normal">{sub}</div>
      </div>
    </button>
  )
}