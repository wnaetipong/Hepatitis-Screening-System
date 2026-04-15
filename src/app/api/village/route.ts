import { NextRequest, NextResponse } from 'next/server'
import { getAllVillages, deleteVillageByMoo, upsertVillages } from '@/lib/db'
import type { VillageRow } from '@/types'

// GET /api/village — คืนข้อมูลทุกหมู่
export async function GET() {
  try {
    const data = await getAllVillages()
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// POST /api/village — import กลุ่มเป้าหมาย (replace by moo)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { moo: string; rows: VillageRow[] }
    if (!body.moo || !Array.isArray(body.rows)) {
      return NextResponse.json({ ok: false, error: 'Missing moo or rows' }, { status: 400 })
    }

    // Delete existing rows for this moo then insert new
    await deleteVillageByMoo(body.moo)
    const rowsWithMoo = body.rows.map(r => ({ ...r, moo: body.moo }))
    await upsertVillages(rowsWithMoo)

    return NextResponse.json({ ok: true, imported: body.rows.length })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
