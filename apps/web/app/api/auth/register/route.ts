import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// POST /api/auth/register — Registro de nueva organización + admin
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { email, password, company_name } = body

  if (!email || !password || !company_name) {
    return NextResponse.json(
      { error: 'Campos requeridos: email, password, company_name' },
      { status: 400 }
    )
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: 'La contraseña debe tener al menos 6 caracteres' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Generar slug desde nombre de empresa
  const slug = company_name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  if (!slug) {
    return NextResponse.json(
      { error: 'Nombre de empresa inválido' },
      { status: 400 }
    )
  }

  // Verificar que el slug no exista
  const { data: existingOrg } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existingOrg) {
    return NextResponse.json(
      { error: 'Ya existe una organización con ese nombre' },
      { status: 409 }
    )
  }

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Error al crear cuenta' },
      { status: 400 }
    )
  }

  const authId = authData.user.id

  // 2. Crear organización
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: company_name.trim(),
      slug,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    // Cleanup: eliminar auth user
    await admin.auth.admin.deleteUser(authId)
    return NextResponse.json(
      { error: 'Error al crear organización' },
      { status: 500 }
    )
  }

  // 3. Crear usuario admin
  const { error: userError } = await admin
    .from('users')
    .insert({
      org_id: org.id,
      auth_id: authId,
      email,
      name: null,
      role: 'admin',
      extension_token: randomUUID(),
    })

  if (userError) {
    // Cleanup
    await admin.from('organizations').delete().eq('id', org.id)
    await admin.auth.admin.deleteUser(authId)
    return NextResponse.json(
      { error: 'Error al crear usuario admin' },
      { status: 500 }
    )
  }

  // 4. Crear política por defecto
  await admin.from('policies').insert({
    org_id: org.id,
    name: 'Política por defecto',
    applies_to: 'all',
    mode: 'warn',
    enabled_detectors: [
      'DNI', 'NIE', 'CIF', 'IBAN', 'CREDIT_CARD',
      'SSN_SPAIN', 'PHONE_SPAIN', 'EMAIL',
      'PASSPORT_SPAIN', 'NIF_PORTUGAL', 'CODICE_FISCALE', 'BIRTHDATE',
    ],
  })

  return NextResponse.json({ success: true }, { status: 201 })
}
