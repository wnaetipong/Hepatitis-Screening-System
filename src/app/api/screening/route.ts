import { NextResponse } from 'next/server'
import { getAllScreenings } from '@/lib/db'
import { buildScreeningDB } from '@/lib/utils'

// GET /api/screening — คืน screening DB ทั้งหมด
export async function GET() {
  try {
    const rows = await getAllScreenings()
    const data = buildScreeningDB(rows)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
