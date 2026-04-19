import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const PAGE_SIZE = 500

export async function GET() {
  try {
    const sb = createServerClient()
    const { count } = await sb.from('smt_records').select('*', { count: 'exact', head: true })
    if (!count) return NextResponse.json({ ok: true, data: [], count: 0 })
    const pages = Math.ceil(count / PAGE_SIZE)
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        sb.from('smt_records').select('*').order('transfer_date', { ascending: false }).range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { rows: unknown[] }
    if (!Array.isArray(body.rows) || !body.rows.length)
      return NextResponse.json({ ok: false, error: 'Missing rows' }, { status: 400 })
    const sb = createServerClient()
    const BATCH = 200
    let upserted = 0
    for (let i = 0; i < body.rows.length; i += BATCH) {
      const chunk = body.rows.slice(i, i + BATCH)
      const { error, count } = await sb
        .from('smt_records')
        .upsert(chunk, { onConflict: 'smt_ref,batch_no,fund_sub', ignoreDuplicates: false, count: 'exact' })
      if (error) throw new Error(error.message)
      upserted += count ?? chunk.length
    }
    return NextResponse.json({ ok: true, imported: upserted })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sb = createServerClient()
    const { searchParams } = new URL(req.url)
    const year = searchParams.get('year')
    let query = sb.from('smt_records').delete()
    if (year) {
      query = query.eq('fiscal_year', year)
    } else {
      query = query.gte('id', 0) // ลบทั้งหมด
    }
    const { error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, year: year ?? 'all' })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}