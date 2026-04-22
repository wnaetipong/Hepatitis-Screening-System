import { NextRequest, NextResponse } from 'next/server'
import { insertScreenings } from '@/lib/db'
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
    const now = new Date().toISOString()

    const toUpsert: ScreeningRow[] = []
    const seenKeys = new Set<string>()
    let skippedEmpty = 0

    for (const row of rows) {
      // รองรับทั้ง column ชื่อไทย (KTB format) และ English format เดิม
      const pid  = (row['หมายเลขบัตรประชาชน'] || row['pid'] || '').replace(/\t/g, '').trim()
      const date = formatThaiDate(row['วันที่รับบริการ'] || '')
      const unit = (row['หน่วยตรวจ'] || row['หน่วยบริการ'] || '').trim()
      const name = (row['ชื่อ-นามสกุล'] || row['name'] || '').trim()

      if (!pid || !date) { skippedEmpty++; continue }

      // dedup ภายใน batch เดียวกัน
      const key = `${pid}|${date}`
      if (seenKeys.has(key)) continue
      seenKeys.add(key)

      // upsert ทุก row (ignoreDuplicates: false) → update name แม้ record มีอยู่แล้ว
      toUpsert.push({ pid, type: body.type, year: body.year, date, unit, name, imported_at: now })
    }

    const imported = await insertScreenings(toUpsert)

    return NextResponse.json({
      ok: true,
      imported,
      skipped: 0,
      skippedEmpty,
      total: rows.length,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}