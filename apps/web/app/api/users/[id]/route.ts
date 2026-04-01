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
// PATCH /api/users/[id] — Editar usuario (requiere admin)
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

  // Solo permitir campos editables
  const allowedFields = ['name', 'group_name', 'policy_mode', 'is_active']
  const updates: Record<string, unknown> = {}

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  if ('policy_mode' in updates && !['warn', 'block', 'monitor'].includes(updates.policy_mode as string)) {
    return NextResponse.json({ error: 'policy_mode inválido. Valores: warn, block, monitor' }, { status: 400 })
  }

  const { data: user, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select('id, email, name, role, group_name, extension_token, policy_mode, is_active, created_at')
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ user })
}

// ---------------------------------------------------------------------------
// DELETE /api/users/[id] — Desactivar usuario / soft delete (requiere admin)
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

  const { data: user, error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select('id, email, is_active')
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ user })
}
