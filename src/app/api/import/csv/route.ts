import { NextRequest, NextResponse } from 'next/server'
import { getExistingPidDates, insertScreenings } from '@/lib/db'
import { parseCSVText, formatThaiDate } from '@/lib/utils'
import type { ScreeningType, ScreeningRow } from '@/types'

// POST /api/import/csv
// body: { type: 'HBsAg'|'AntiHCV', year: '2567', csvText: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      type: ScreeningType
      year: string
      csvText: string
    }

    if (!body.type || !body.year || !body.csvText) {
      return NextResponse.json({ ok: false, error: 'Missing type, year, or csvText' }, { status: 400 })
    }
    if (!['HBsAg', 'AntiHCV'].includes(body.type)) {
      return NextResponse.json({ ok: false, error: 'type ต้องเป็น HBsAg หรือ AntiHCV' }, { status: 400 })
    }

    const rows = parseCSVText(body.csvText)
    const existing = await getExistingPidDates(body.type, body.year)
    const now = new Date().toISOString()

    const toInsert: ScreeningRow[] = []
    let skipped = 0, skippedEmpty = 0

    for (const row of rows) {
      const pid  = (row['หมายเลขบัตรประชาชน'] || row['pid'] || '').trim()
      const date = formatThaiDate(row['วันที่รับบริการ'] || '')
      const unit = (row['หน่วยตรวจ'] || '').trim()

      if (!pid || !date) { skippedEmpty++; continue }

      const key = `${pid}|${date}`
      if (existing.has(key)) { skipped++; continue }

      toInsert.push({ pid, type: body.type, year: body.year, date, unit, imported_at: now })
      existing.add(key) // prevent duplicate within same batch
    }

    const imported = await insertScreenings(toInsert)

    return NextResponse.json({
      ok: true,
      imported,
      skipped,
      skippedEmpty,
      total: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
