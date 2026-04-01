import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { corsHeaders, corsPreflightResponse } from '@/lib/cors'

export async function OPTIONS() {
  return corsPreflightResponse()
}

// ---------------------------------------------------------------------------
// POST /api/health/selectors — Extensión reporta fallo de selectores
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return corsHeaders(NextResponse.json({ error: 'Token requerido' }, { status: 401 }))
  }

  const token = authHeader.slice(7)
  const admin = createAdminClient()

  // Buscar usuario por extension_token
  const { data: user, error: userError } = await admin
    .from('users')
    .select('id, org_id, is_active')
    .eq('extension_token', token)
    .single()

  if (userError || !user) {
    return corsHeaders(NextResponse.json({ error: 'Token inválido' }, { status: 401 }))
  }

  if (!user.is_active) {
    return corsHeaders(NextResponse.json({ error: 'Usuario desactivado' }, { status: 401 }))
  }

  // Validar body
  const body = await request.json().catch(() => null)
  if (!body) {
    return corsHeaders(NextResponse.json({ error: 'Body inválido' }, { status: 400 }))
  }

  const { platform, missing_elements, selectors_used, user_agent, timestamp } = body

  if (!platform || !missing_elements || !Array.isArray(missing_elements)) {
    return corsHeaders(NextResponse.json({ error: 'Campos requeridos: platform, missing_elements' }, { status: 400 }))
  }

  // Validar que missing_elements solo contiene valores válidos
  const validElements = ['textarea', 'submit_button']
  if (!missing_elements.every((el) => validElements.includes(el))) {
    return corsHeaders(NextResponse.json({ error: 'missing_elements debe contener: textarea | submit_button' }, { status: 400 }))
  }

  // Insertar reporte
  const { error: insertError } = await admin
    .from('selector_health_reports')
    .insert({
      org_id: user.org_id,
      user_id: user.id,
      platform,
      missing_elements,
      selectors_used: selectors_used ?? null,
      user_agent: user_agent ?? null,
      reported_at: new Date(timestamp).toISOString(),
    })

  if (insertError) {
    console.error('[Health API] Error insertando reporte:', insertError)
    return corsHeaders(NextResponse.json({ error: 'Error al guardar reporte' }, { status: 500 }))
  }

  // Verificar si hay múltiples reportes para esta plataforma en las últimas 24 horas
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: reports, error: queryError } = await admin
    .from('selector_health_reports')
    .select('user_id, org_id', { count: 'exact' })
    .eq('platform', platform)
    .gte('reported_at', twentyFourHoursAgo)

  if (!queryError && reports && reports.length > 3) {
    // Hay más de 3 reportes distintos para esta plataforma en 24h
    const uniqueReporters = new Set(reports.map((r) => `${r.org_id}-${r.user_id}`))
    if (uniqueReporters.size > 3) {
      console.warn(
        `[Health API] ⚠️ ALERTA: Múltiples reportes de fallo de selectores para ${platform} en las últimas 24h (${uniqueReporters.size} usuarios/orgs)`,
      )
    }
  }

  return corsHeaders(NextResponse.json({ ok: true }, { status: 201 }))
}
