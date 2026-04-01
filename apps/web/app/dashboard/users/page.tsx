'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Pencil, UserCheck, UserX, Copy, Check, Info } from 'lucide-react'
import type { User, PolicyMode } from '@/lib/types'

const modeLabel: Record<string, string> = {
  warn: 'Avisar',
  block: 'Bloquear',
  monitor: 'Monitor',
}

const modeVariant: Record<string, 'outline' | 'destructive' | 'secondary'> = {
  warn: 'outline',
  block: 'destructive',
  monitor: 'secondary',
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Add form
  const [addEmail, setAddEmail] = useState('')
  const [addName, setAddName] = useState('')
  const [addDepartment, setAddDepartment] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Edit form
  const [editName, setEditName] = useState('')
  const [editDepartment, setEditDepartment] = useState('')
  const [editMode, setEditMode] = useState<PolicyMode>('warn')
  const [editLoading, setEditLoading] = useState(false)

  async function fetchUsers() {
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setError(null)

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: addEmail,
        name: addName || undefined,
        group_name: addDepartment || undefined,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al crear usuario')
      setAddLoading(false)
      return
    }

    setShowAddDialog(false)
    setAddEmail('')
    setAddName('')
    setAddDepartment('')
    setAddLoading(false)
    fetchUsers()
  }

  function openEdit(user: User) {
    setEditingUser(user)
    setEditName(user.name ?? '')
    setEditDepartment(user.group_name ?? '')
    setEditMode(user.policy_mode)
    setError(null)
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    setEditLoading(true)
    setError(null)

    const res = await fetch(`/api/users/${editingUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName || null,
        group_name: editDepartment || null,
        policy_mode: editMode,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al actualizar usuario')
      setEditLoading(false)
      return
    }

    setEditingUser(null)
    setEditLoading(false)
    fetchUsers()
  }

  async function toggleActive(user: User) {
    await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    })
    fetchUsers()
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(token)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <Button onClick={() => { setShowAddDialog(true); setError(null) }}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir usuario
        </Button>
      </div>

      {/* Installation instructions */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Instrucciones de instalación</AlertTitle>
        <AlertDescription>
          Para cada usuario: 1) Instala la extensión de Chrome, 2) Haz clic en el icono de ShieldAI,
          3) Introduce la URL del servidor: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}</code>,
          4) Pega el token del usuario y haz clic en Conectar.
        </AlertDescription>
      </Alert>

      {/* Users table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Token</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No hay usuarios. Añade el primero.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name ?? '—'}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.group_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={modeVariant[user.policy_mode]}>
                      {modeLabel[user.policy_mode] ?? user.policy_mode}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      {user.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <code className="text-xs font-mono text-muted-foreground">
                        {user.extension_token.slice(0, 8)}...
                      </code>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => copyToken(user.extension_token)}
                      >
                        {copiedToken === user.extension_token ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(user)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => toggleActive(user)}>
                        {user.is_active ? (
                          <UserX className="h-3 w-3" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="add-email" className="text-sm font-medium">Email *</label>
              <Input
                id="add-email"
                type="email"
                placeholder="empleado@empresa.com"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="add-name" className="text-sm font-medium">Nombre</label>
              <Input
                id="add-name"
                type="text"
                placeholder="Nombre completo"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="add-dept" className="text-sm font-medium">Departamento</label>
              <Input
                id="add-dept"
                type="text"
                placeholder="Ej: Marketing, Desarrollo..."
                value={addDepartment}
                onChange={(e) => setAddDepartment(e.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="submit" disabled={addLoading}>
                {addLoading ? 'Creando...' : 'Crear usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="edit-name" className="text-sm font-medium">Nombre</label>
              <Input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-dept" className="text-sm font-medium">Departamento</label>
              <Input
                id="edit-dept"
                type="text"
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Modo de política</label>
              <Select value={editMode} onValueChange={(v) => setEditMode((v ?? 'warn') as PolicyMode)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warn">Avisar</SelectItem>
                  <SelectItem value="block">Bloquear</SelectItem>
                  <SelectItem value="monitor">Monitor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
