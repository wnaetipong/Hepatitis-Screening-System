import { NextRequest, NextResponse } from 'next/server'
import { getAllVillages, deleteVillageByMoo, upsertVillages, updateVillageById, deleteVillageById } from '@/lib/db'
import type { VillageRow } from '@/types'

// GET /api/village — คืนข้อมูลทุกหมู่ (หรือ ?countByMoo=1 สำหรับนับจำนวนรายหมู่)
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const data = await getAllVillages()
    if (url.searchParams.get('countByMoo') === '1') {
      // data เป็น Record<string, VillageRow[]>
      const counts: Record<string, number> = {}
      for (const [moo, rows] of Object.entries(data)) {
        counts[moo] = rows.length
      }
      return NextResponse.json({ ok: true, data: counts })
    }
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
    await deleteVillageByMoo(body.moo)
    const rowsWithMoo = body.rows.map(r => ({ ...r, moo: body.moo }))
    await upsertVillages(rowsWithMoo)
    return NextResponse.json({ ok: true, imported: body.rows.length })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// PUT /api/village — แก้ไขข้อมูลรายคน
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { id: number; row: Partial<VillageRow> }
    if (!body.id || !body.row) {
      return NextResponse.json({ ok: false, error: 'Missing id or row' }, { status: 400 })
    }
    await updateVillageById(body.id, body.row)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// DELETE /api/village — ลบรายคน
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { id: number }
    if (!body.id) {
      return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 })
    }
    await deleteVillageById(body.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}