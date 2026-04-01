'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Copy, Check, ChevronRight } from 'lucide-react'
import type { User } from '@/lib/types'

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [createdUser, setCreatedUser] = useState<User | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Step 1 form
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [department, setDepartment] = useState('')

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: name || undefined,
        group_name: department || undefined,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al crear usuario')
      setLoading(false)
      return
    }

    setCreatedUser(data.user)
    setLoading(false)
    setStep(2)
  }

  function copyToken() {
    if (!createdUser) return
    navigator.clipboard.writeText(createdUser.extension_token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Configuración inicial</CardTitle>
          <CardDescription>Paso {step} de 3</CardDescription>
          <div className="flex justify-center gap-2 pt-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-8 rounded-full transition-colors ${
                  s <= step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {/* Step 1: Create first user */}
          {step === 1 && (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Añade tu primer usuario</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Crea el primer usuario que será monitorizado por la extensión.
                  Puede ser tu propio usuario o el de un empleado.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="setup-email" className="text-sm font-medium">Email *</label>
                <Input
                  id="setup-email"
                  type="email"
                  placeholder="empleado@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="setup-name" className="text-sm font-medium">Nombre</label>
                <Input
                  id="setup-name"
                  type="text"
                  placeholder="Nombre completo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="setup-dept" className="text-sm font-medium">Departamento</label>
                <Input
                  id="setup-dept"
                  type="text"
                  placeholder="Ej: Marketing"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creando...' : 'Crear usuario'}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}

          {/* Step 2: Install extension */}
          {step === 2 && createdUser && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Instala la extensión</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Sigue estos pasos para configurar la extensión en el navegador del usuario.
                </p>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <Badge variant="secondary" className="shrink-0">1</Badge>
                  <p>Instala la extensión de Guripa AI desde la Chrome Web Store</p>
                </div>
                <div className="flex gap-3">
                  <Badge variant="secondary" className="shrink-0">2</Badge>
                  <p>Haz clic en el icono de Guripa AI en la barra de extensiones</p>
                </div>
                <div className="flex gap-3">
                  <Badge variant="secondary" className="shrink-0">3</Badge>
                  <div>
                    <p>Introduce la URL del servidor:</p>
                    <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs font-mono">
                      {origin}
                    </code>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="secondary" className="shrink-0">4</Badge>
                  <div className="flex-1">
                    <p>Introduce el token del usuario:</p>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono break-all">
                        {createdUser.extension_token}
                      </code>
                      <Button variant="outline" size="sm" onClick={copyToken}>
                        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="secondary" className="shrink-0">5</Badge>
                  <p>Haz clic en <strong>Conectar</strong></p>
                </div>
              </div>

              <Button className="w-full mt-4" onClick={() => setStep(3)}>
                Siguiente
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">¡Todo listo!</h3>
              <p className="text-sm text-muted-foreground">
                Tu protección está activa. La extensión está monitorizando el uso de
                herramientas de IA. Recibirás un email semanal con el resumen de actividad.
              </p>
              <Button className="w-full" onClick={() => router.push('/dashboard')}>
                Ir al dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
