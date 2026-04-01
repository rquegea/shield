import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------------------
// GET /api/selectors — Selectores CSS de plataformas (público, sin auth)
// ---------------------------------------------------------------------------

export async function GET() {
  const admin = createAdminClient()

  const { data: selectors, error } = await admin
    .from('platform_selectors')
    .select('platform, selectors, version, updated_at')

  if (error) {
    return NextResponse.json({ error: 'Error al obtener selectores' }, { status: 500 })
  }

  return NextResponse.json({ selectors })
}
