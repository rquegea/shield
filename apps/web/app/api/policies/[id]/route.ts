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
// PATCH /api/policies/[id] — Editar política (requiere admin)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const orgId = await getAdminOrgId(supabase)

  if (!orgId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const allowedFields = ['name', 'applies_to', 'enabled_detectors', 'blocked_platforms', 'mode', 'whitelist_patterns', 'is_active']
  const updates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  if ('mode' in updates && !['warn', 'block', 'monitor'].includes(updates.mode as string)) {
    return NextResponse.json({ error: 'Mode inválido. Valores: warn, block, monitor' }, { status: 400 })
  }

  const { data: policy, error } = await supabase
    .from('policies')
    .update(updates)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error || !policy) {
    return NextResponse.json({ error: 'Política no encontrada' }, { status: 404 })
  }

  return NextResponse.json({ policy })
}

// ---------------------------------------------------------------------------
// DELETE /api/policies/[id] — Eliminar política (requiere admin)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const orgId = await getAdminOrgId(supabase)

  if (!orgId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { error } = await supabase
    .from('policies')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: 'Error al eliminar política' }, { status: 500 })
  }

  return NextResponse.json({ deleted: true })
}
