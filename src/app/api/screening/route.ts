import { NextRequest, NextResponse } from 'next/server'
import { getAllScreenings, upsertScreeningForPid, deleteScreeningForPid } from '@/lib/db'
import { buildScreeningDB } from '@/lib/utils'
import type { ScreeningType } from '@/types'

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

// PUT /api/screening — แก้ไข/เพิ่มข้อมูลตรวจรายคน
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      pid: string; type: ScreeningType; year: string; date: string; unit: string
    }
    if (!body.pid || !body.type || !body.year) {
      return NextResponse.json({ ok: false, error: 'Missing pid, type, or year' }, { status: 400 })
    }
    await upsertScreeningForPid(body.pid, body.type, body.year, body.date ?? '', body.unit ?? '')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// DELETE /api/screening — ลบข้อมูลตรวจรายคน
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json() as { pid: string; type: ScreeningType; year: string }
    if (!body.pid || !body.type || !body.year) {
      return NextResponse.json({ ok: false, error: 'Missing pid, type, or year' }, { status: 400 })
    }
    await deleteScreeningForPid(body.pid, body.type, body.year)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}