import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

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
// GET /api/users — Lista usuarios de la org (requiere admin)
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = createClient()
  const orgId = await getAdminOrgId(supabase)

  if (!orgId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, name, role, group_name, extension_token, policy_mode, is_active, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Error al obtener usuarios' }, { status: 500 })
  }

  return NextResponse.json({ users })
}

// ---------------------------------------------------------------------------
// POST /api/users — Crear usuario nuevo (requiere admin)
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

  const { email, name, group_name, role } = body

  if (!email) {
    return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
  }

  if (role && !['admin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'Role inválido. Valores: admin, user' }, { status: 400 })
  }

  // Verificar límite de usuarios de la org
  const admin = createAdminClient()

  const { count } = await admin
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('is_active', true)

  const { data: org } = await admin
    .from('organizations')
    .select('max_users')
    .eq('id', orgId)
    .single()

  if (org && count != null && count >= org.max_users) {
    return NextResponse.json({ error: `Límite de usuarios alcanzado (${org.max_users})` }, { status: 409 })
  }

  // Verificar email duplicado en la org
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Ya existe un usuario con ese email en la organización' }, { status: 409 })
  }

  const { data: newUser, error: insertError } = await admin
    .from('users')
    .insert({
      org_id: orgId,
      email,
      name: name ?? null,
      group_name: group_name ?? null,
      role: role ?? 'user',
      extension_token: randomUUID(),
    })
    .select('id, email, name, role, group_name, extension_token, policy_mode, is_active, created_at')
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
  }

  return NextResponse.json({ user: newUser }, { status: 201 })
}
