import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const PAGE_SIZE = 500

export async function GET() {
  try {
    const sb = createServerClient()
    const { count } = await sb.from('rep_summary').select('*', { count: 'exact', head: true })
    if (!count) return NextResponse.json({ ok: true, data: [], count: 0 })
    const pages = Math.ceil(count / PAGE_SIZE)
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        sb.from('rep_summary').select('*').order('rep_date', { ascending: false }).range(i * PAGE_SIZE, (i + 1) * PAGE_SIZE - 1)
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
    const { error, count } = await sb
      .from('rep_summary')
      .upsert(body.rows, { onConflict: 'rep_no', ignoreDuplicates: false, count: 'exact' })
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, imported: count ?? body.rows.length })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const sb = createServerClient()
    const { error } = await sb.from('rep_summary').delete().gte('id', 0)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}