import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { corsHeaders, corsPreflightResponse } from '@/lib/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return corsPreflightResponse()
}

// ---------------------------------------------------------------------------
// GET /api/selectors — Selectores CSS de plataformas (público, sin auth)
// ---------------------------------------------------------------------------

export async function GET() {
  const admin = createAdminClient()

  const { data: selectors, error } = await admin
    .from('platform_selectors')
    .select('platform, selectors, version, updated_at')

  if (error) {
    return corsHeaders(NextResponse.json({ error: 'Error al obtener selectores' }, { status: 500 }))
  }

  return corsHeaders(NextResponse.json({ selectors }))
}
