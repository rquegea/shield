import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DEFAULT_POLICY = {
  mode: 'warn' as const,
  enabled_detectors: ['DNI', 'NIE', 'CIF', 'IBAN', 'CREDIT_CARD', 'SSN_SPAIN', 'PHONE_SPAIN', 'EMAIL'],
  whitelist_patterns: [] as string[],
  blocked_platforms: [] as string[],
  sensitivity_level: 'medium',
}

// ---------------------------------------------------------------------------
// GET /api/config — Extensión pide configuración (auth con extension_token)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const admin = createAdminClient()

  // Buscar usuario por extension_token
  const { data: user, error: userError } = await admin
    .from('users')
    .select('id, org_id, name, email, group_name, is_active')
    .eq('extension_token', token)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  if (!user.is_active) {
    return NextResponse.json({ error: 'Usuario desactivado' }, { status: 401 })
  }

  // Organización
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('name, slug')
    .eq('id', user.org_id)
    .single()

  if (orgError || !org) {
    return NextResponse.json({ error: 'Organización no encontrada' }, { status: 500 })
  }

  // Resolver policy: primero por group_name, luego applies_to='all'
  let policy = null

  if (user.group_name) {
    const { data: groupPolicy } = await admin
      .from('policies')
      .select('mode, enabled_detectors, whitelist_patterns, blocked_platforms, is_active')
      .eq('org_id', user.org_id)
      .eq('applies_to', user.group_name)
      .eq('is_active', true)
      .single()

    if (groupPolicy) {
      policy = groupPolicy
    }
  }

  if (!policy) {
    const { data: allPolicy } = await admin
      .from('policies')
      .select('mode, enabled_detectors, whitelist_patterns, blocked_platforms, is_active')
      .eq('org_id', user.org_id)
      .eq('applies_to', 'all')
      .eq('is_active', true)
      .single()

    if (allPolicy) {
      policy = allPolicy
    }
  }

  const resolvedPolicy = policy
    ? {
        mode: policy.mode,
        enabled_detectors: policy.enabled_detectors,
        whitelist_patterns: policy.whitelist_patterns,
        blocked_platforms: policy.blocked_platforms,
        sensitivity_level: 'medium',
      }
    : DEFAULT_POLICY

  return NextResponse.json({
    organization: { name: org.name, slug: org.slug },
    policy: resolvedPolicy,
    user: { name: user.name, email: user.email, group_name: user.group_name },
  })
}
