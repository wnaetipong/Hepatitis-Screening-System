'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ScreeningDB, VillageRow, AppConfig } from '@/types'
import { buildScreeningDB } from '@/lib/utils'
import { DEFAULT_CONFIG } from '@/types'

// ── Village data ─────────────────────────────────────────────────
export function useVillageData() {
  const [data, setData] = useState<Record<string, VillageRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/village')
      const json = await res.json()
      if (json.ok) setData(json.data)
      else setError(json.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

// ── Screening data ───────────────────────────────────────────────
export function useScreeningData() {
  const [db, setDb] = useState<ScreeningDB>({ HBsAg: {}, AntiHCV: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/screening')
      const json = await res.json()
      if (json.ok) setDb(json.data)
      else setError(json.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { db, loading, error, reload: load }
}

// ── App config ───────────────────────────────────────────────────
export function useConfig() {
  const [cfg, setCfg] = useState<AppConfig>(DEFAULT_CONFIG)

  // โหลดจาก localStorage ก่อน (เร็ว) แล้วค่อย sync จาก API
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hepCfg')
      if (saved) setCfg({ ...DEFAULT_CONFIG, ...JSON.parse(saved) })
    } catch { /* ignore */ }
  }, [])

  const save = useCallback(async (newCfg: AppConfig) => {
    setCfg(newCfg)
    try {
      localStorage.setItem('hepCfg', JSON.stringify(newCfg))
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCfg),
      })
    } catch { /* ignore */ }
  }, [])

  const reset = useCallback(() => {
    save(DEFAULT_CONFIG)
    try { localStorage.removeItem('hepCfg') } catch { /* ignore */ }
  }, [save])

  return { cfg, save, reset }
}
