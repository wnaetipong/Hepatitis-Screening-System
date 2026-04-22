import { createServerClient } from './supabase'
import type { VillageRow, ScreeningRow, ScreeningType } from '@/types'

// ── Village ──────────────────────────────────────────────────────
export async function getAllVillages(): Promise<Record<string, VillageRow[]>> {
  const sb = createServerClient()
  const PAGE = 1000

  const { count } = await sb.from('villages').select('*', { count: 'exact', head: true })
  if (!count) return {}

  const pages = Math.ceil(count / PAGE)
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      sb.from('villages').select('*').order('moo').order('no').range(i * PAGE, (i + 1) * PAGE - 1)
    )
  )

  const all: VillageRow[] = []
  for (const { data, error } of results) {
    if (error) throw new Error(error.message)
    if (data) all.push(...(data as VillageRow[]))
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

  const { count } = await sb.from('screenings').select('*', { count: 'exact', head: true })
  if (!count) return []

  const pages = Math.ceil(count / PAGE)
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      sb.from('screenings')
        .select('pid, type, year, date, unit, name, imported_at')
        .range(i * PAGE, (i + 1) * PAGE - 1)
    )
  )

  const all: ScreeningRow[] = []
  for (const { data, error } of results) {
    if (error) throw new Error(error.message)
    if (data) all.push(...(data as ScreeningRow[]))
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
      .upsert(chunk, { onConflict: 'pid,date,type', ignoreDuplicates: false, count: 'exact' })
    if (error) throw new Error(error.message)
    total += count ?? chunk.length
  }

  return total
}

// upsert screening สำหรับแก้ไขรายคน (replace ทั้งหมดของ pid+type)
export async function upsertScreeningForPid(
  pid: string,
  type: ScreeningType,
  year: string,
  date: string,
  unit: string,
): Promise<void> {
  const sb = createServerClient()
  // ลบรายการเก่าทั้งหมดของ pid+type+year ก่อน แล้ว insert ใหม่
  if (date) {
    await sb.from('screenings').delete()
      .eq('pid', pid).eq('type', type).eq('year', year)
    const { error } = await sb.from('screenings').insert({
      pid, type, year, date, unit, name: '', imported_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message)
  } else {
    // date ว่าง = ลบทิ้ง
    await sb.from('screenings').delete()
      .eq('pid', pid).eq('type', type).eq('year', year)
  }
}

export async function deleteScreeningForPid(
  pid: string,
  type: ScreeningType,
  year: string,
): Promise<void> {
  const sb = createServerClient()
  const { error } = await sb.from('screenings').delete()
    .eq('pid', pid).eq('type', type).eq('year', year)
  if (error) throw new Error(error.message)
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