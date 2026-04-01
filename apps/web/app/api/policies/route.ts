import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper: obtener org_id del admin autenticado
async function getAdminOrgId(supabase: ReturnType<typeof createClient>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: adminUser } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', user.id)
    .eq('role', 'admin')
    .single()

  return adminUser?.org_id ?? null
}

// ---------------------------------------------------------------------------
// GET /api/policies — Lista políticas de la org (requiere admin)
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = createClient()
  const orgId = await getAdminOrgId(supabase)

  if (!orgId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data: policies, error } = await supabase
    .from('policies')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Error al obtener políticas' }, { status: 500 })
  }

  return NextResponse.json({ policies })
}

// ---------------------------------------------------------------------------
// POST /api/policies — Crear política nueva (requiere admin)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const orgId = await getAdminOrgId(supabase)

  if (!orgId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { name, applies_to, enabled_detectors, blocked_platforms, mode, whitelist_patterns } = body

  if (!name) {
    return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  }

  if (mode && !['warn', 'block', 'monitor'].includes(mode)) {
    return NextResponse.json({ error: 'Mode inválido. Valores: warn, block, monitor' }, { status: 400 })
  }

  const { data: policy, error: insertError } = await supabase
    .from('policies')
    .insert({
      org_id: orgId,
      name,
      applies_to: applies_to ?? 'all',
      enabled_detectors: enabled_detectors ?? ['DNI', 'NIE', 'CIF', 'IBAN', 'CREDIT_CARD', 'SSN_SPAIN', 'PHONE_SPAIN', 'EMAIL'],
      blocked_platforms: blocked_platforms ?? [],
      mode: mode ?? 'warn',
      whitelist_patterns: whitelist_patterns ?? [],
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Error al crear política' }, { status: 500 })
  }

  return NextResponse.json({ policy }, { status: 201 })
}
