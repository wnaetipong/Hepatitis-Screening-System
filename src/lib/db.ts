import { createServerClient } from './supabase'
import type { VillageRow, ScreeningRow, ScreeningType } from '@/types'

// ── Village ──────────────────────────────────────────────────────
export async function getAllVillages(): Promise<Record<string, VillageRow[]>> {
  const sb = createServerClient()
  const PAGE = 1000
  const all: VillageRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await sb
      .from('villages')
      .select('*')
      .order('moo')
      .order('no')
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...(data as VillageRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const result: Record<string, VillageRow[]> = {}
  for (const row of all) {
    if (!result[row.moo]) result[row.moo] = []
    result[row.moo].push(row)
  }
  return result
}

export async function upsertVillages(rows: VillageRow[]): Promise<number> {
  const sb = createServerClient()
  const BATCH = 500
  let total = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error, count } = await sb
      .from('villages')
      .upsert(chunk, { onConflict: 'pid,moo', count: 'exact' })
    if (error) throw new Error(error.message)
    total += count ?? chunk.length
  }

  return total
}

export async function deleteVillageByMoo(moo: string): Promise<void> {
  const sb = createServerClient()
  const { error } = await sb.from('villages').delete().eq('moo', moo)
  if (error) throw new Error(error.message)
}

export async function updateVillageById(id: number, row: Partial<VillageRow>): Promise<void> {
  const sb = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...fields } = row as VillageRow & { id?: number }
  const { error } = await sb.from('villages').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteVillageById(id: number): Promise<void> {
  const sb = createServerClient()
  const { error } = await sb.from('villages').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Screening ────────────────────────────────────────────────────
export async function getAllScreenings(): Promise<ScreeningRow[]> {
  const sb = createServerClient()
  const PAGE = 1000
  const all: ScreeningRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await sb
      .from('screenings')
      .select('pid, type, year, date, unit')
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break
    all.push(...(data as ScreeningRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}

export async function getExistingPidDates(
  type: ScreeningType,
  year: string,
): Promise<Set<string>> {
  const sb = createServerClient()
  const PAGE = 1000
  const set = new Set<string>()
  let from = 0

  for (;;) {
    const { data, error } = await sb
      .from('screenings')
      .select('pid, date')
      .eq('type', type)
      .eq('year', year)
      .range(from, from + PAGE - 1)

    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const row of data) set.add(`${row.pid}|${row.date}`)
    if (data.length < PAGE) break
    from += PAGE
  }

  return set
}

export async function insertScreenings(rows: ScreeningRow[]): Promise<number> {
  if (!rows.length) return 0
  const sb = createServerClient()
  const BATCH = 500
  let total = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error, count } = await sb
      .from('screenings')
      .upsert(chunk, { onConflict: 'pid,date,type', ignoreDuplicates: true, count: 'exact' })
    if (error) throw new Error(error.message)
    total += count ?? chunk.length
  }

  return total
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