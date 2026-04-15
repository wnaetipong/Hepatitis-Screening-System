import { createServerClient } from './supabase'
import type { VillageRow, ScreeningRow, ScreeningType } from '@/types'

// ── Village ──────────────────────────────────────────────────────
export async function getAllVillages(): Promise<Record<string, VillageRow[]>> {
  const sb = createServerClient()
  const { data, error } = await sb
    .from('villages')
    .select('*')
    .order('moo')
    .order('no')
    .limit(50000)

  if (error) throw new Error(error.message)

  // group by moo
  const result: Record<string, VillageRow[]> = {}
  for (const row of (data ?? [])) {
    if (!result[row.moo]) result[row.moo] = []
    result[row.moo].push(row as VillageRow)
  }
  return result
}

export async function upsertVillages(rows: VillageRow[]): Promise<number> {
  const sb = createServerClient()
  // upsert โดยใช้ pid + moo เป็น unique key
  const { error, count } = await sb
    .from('villages')
    .upsert(rows, { onConflict: 'pid,moo', count: 'exact' })

  if (error) throw new Error(error.message)
  return count ?? rows.length
}

export async function deleteVillageByMoo(moo: string): Promise<void> {
  const sb = createServerClient()
  const { error } = await sb.from('villages').delete().eq('moo', moo)
  if (error) throw new Error(error.message)
}

// ── Screening ────────────────────────────────────────────────────
export async function getAllScreenings(): Promise<ScreeningRow[]> {
  const sb = createServerClient()
  const { data, error } = await sb
    .from('screenings')
    .select('pid, type, year, date, unit')
    .limit(50000)

  if (error) throw new Error(error.message)
  return (data ?? []) as ScreeningRow[]
}

export async function getExistingPidDates(
  type: ScreeningType,
  year: string,
): Promise<Set<string>> {
  const sb = createServerClient()
  const { data, error } = await sb
    .from('screenings')
    .select('pid, date')
    .eq('type', type)
    .eq('year', year)

  if (error) throw new Error(error.message)
  const set = new Set<string>()
  for (const row of (data ?? [])) set.add(`${row.pid}|${row.date}`)
  return set
}

export async function insertScreenings(rows: ScreeningRow[]): Promise<number> {
  if (!rows.length) return 0
  const sb = createServerClient()
  const { error, count } = await sb
    .from('screenings')
    .insert(rows, { count: 'exact' })

  if (error) throw new Error(error.message)
  return count ?? rows.length
}

// ── Settings ─────────────────────────────────────────────────────
export async function getSetting(key: string): Promise<string | null> {
  const sb = createServerClient()
  const { data } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const sb = createServerClient()
  await sb
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' })
}
