import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const PAGE_SIZE = 1000

// GET /api/seamless
export async function GET() {
  try {
    const sb = createServerClient()
    const { count } = await sb
      .from('seamless_records')
      .select('*', { count: 'exact', head: true })

    if (!count) return NextResponse.json({ ok: true, data: [], count: 0 })

    const pages = Math.ceil(count / PAGE_SIZE)
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        sb.from('seamless_records')
          .select('*')
          .order('id')
          .range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
      )
    )

    const all: unknown[] = []
    for (const { data, error } of results) {
      if (error) throw new Error(error.message)
      if (data) all.push(...data)
    }

    return NextResponse.json({ ok: true, data: all, count: all.length })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// POST /api/seamless — upsert (อัปเดตถ้า trans_id+item_seq ซ้ำ)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { rows: unknown[] }
    if (!Array.isArray(body.rows) || !body.rows.length) {
      return NextResponse.json({ ok: false, error: 'Missing rows' }, { status: 400 })
    }

    const sb = createServerClient()
    const BATCH = 500
    let upserted = 0

    for (let i = 0; i < body.rows.length; i += BATCH) {
      const chunk = body.rows.slice(i, i + BATCH)
      const { error, count } = await sb
        .from('seamless_records')
        .upsert(chunk, {
          onConflict: 'trans_id,item_seq',  // อัปเดตถ้าซ้ำ (upsert จริง)
          ignoreDuplicates: false,           // false = แทนที่ด้วยค่าใหม่
          count: 'exact',
        })
      if (error) throw new Error(error.message)
      upserted += count ?? chunk.length
    }

    return NextResponse.json({ ok: true, imported: upserted })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// DELETE /api/seamless — ล้างทั้งหมด
export async function DELETE() {
  try {
    const sb = createServerClient()
    const { error } = await sb
      .from('seamless_records')
      .delete()
      .gte('id', 0)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}