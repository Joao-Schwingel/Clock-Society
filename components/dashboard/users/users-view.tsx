"use client"

import { useCallback, useEffect, useId, useState } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { createClient } from "@/lib/supabase/client"
import type { Company } from "@/lib/types"
import type { UserSummary } from "@/lib/users/repo"
import { UserForm, type SalespersonOption } from "./user-form"

const ROLE_LABEL: Record<string, string> = { admin: "Administrador", vendedor: "Vendedor" }

// Tela de Usuários do admin (planejamento 3.2/3.3; Fase 6, fatia 6.7; V-UI-09).
export function UsersView({ companies }: { companies: Company[] }) {
  const id = useId()
  const [users, setUsers] = useState<UserSummary[]>([])
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<UserSummary | null>(null)
  const [editName, setEditName] = useState("")
  const [resetting, setResetting] = useState<UserSummary | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [dialogError, setDialogError] = useState<string | null>(null)

  // Recarregar = incrementar a chave; o efeito busca e aplica o resultado de forma assíncrona.
  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => {
    setIsLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/users").then(async (res) => (res.ok ? ((await res.json()).users as UserSummary[]) : null)),
      createClient().from("salespersons").select("id, name, company_id").order("name"),
    ]).then(([loaded, { data: sps }]) => {
      if (cancelled) return
      if (loaded) setUsers(loaded)
      else toast.error("Não foi possível carregar os usuários.", { position: "top-center" })
      setSalespersons(sps ?? [])
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const patch = async (userId: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) {
      const message = json.fields ? Object.values(json.fields)[0] : json.error
      return String(message ?? "Não foi possível salvar.")
    }
    return null
  }

  const toggleActive = async (user: UserSummary) => {
    const action = user.is_active ? "Desativar" : "Reativar"
    if (!confirm(`${action} ${user.full_name ?? user.email}?`)) return
    const error = await patch(user.id, { is_active: !user.is_active })
    if (error) toast.error(error, { position: "top-center" })
    else {
      toast.success(user.is_active ? "Usuário desativado" : "Usuário reativado", { position: "top-center" })
      load()
    }
  }

  const saveName = async () => {
    if (!editing) return
    const error = await patch(editing.id, { full_name: editName })
    if (error) return setDialogError(error)
    setEditing(null)
    toast.success("Usuário atualizado", { position: "top-center" })
    load()
  }

  const saveReset = async () => {
    if (!resetting) return
    const error = await patch(resetting.id, { reset_password: resetPassword })
    if (error) return setDialogError(error)
    setResetting(null)
    toast.success("Senha redefinida. O usuário vai trocá-la no próximo acesso.", { position: "top-center" })
    load()
  }

  const companyName = (companyId: string) => companies.find((c) => c.id === companyId)?.name ?? ""
  const linkedIds = new Set(users.flatMap((u) => u.salespersons.map((sp) => sp.id)))

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>Logins de administradores e vendedores</CardDescription>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo usuário
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">Carregando...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Vendedor vinculado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name ?? "—"}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{ROLE_LABEL[user.role] ?? user.role}</TableCell>
                  <TableCell>
                    {user.salespersons.length === 0
                      ? "—"
                      : user.salespersons.map((sp) => `${sp.name} (${companyName(sp.company_id)})`).join(", ")}
                  </TableCell>
                  <TableCell className="space-x-1">
                    <Badge variant={user.is_active ? "default" : "secondary"}>
                      {user.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                    {user.must_change_password && <Badge variant="outline">Troca de senha pendente</Badge>}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(user)
                        setEditName(user.full_name ?? "")
                        setDialogError(null)
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResetting(user)
                        setResetPassword("")
                        setDialogError(null)
                      }}
                    >
                      Resetar senha
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void toggleActive(user)}>
                      {user.is_active ? "Desativar" : "Reativar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {showForm && (
        <UserForm
          companies={companies}
          salespersons={salespersons}
          linkedIds={linkedIds}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            toast.success("Usuário criado", { position: "top-center" })
            load()
          }}
        />
      )}

      {editing && (
        <Dialog open onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar usuário</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-edit-name`}>Nome *</Label>
              <Input id={`${id}-edit-name`} value={editName} onChange={(e) => setEditName(e.target.value)} />
              {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void saveName()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {resetting && (
        <Dialog open onOpenChange={(open) => !open && setResetting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resetar senha de {resetting.full_name ?? resetting.email}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={`${id}-reset`}>Nova senha temporária *</Label>
              <Input
                id={`${id}-reset`}
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">O usuário vai trocá-la no próximo acesso.</p>
              {dialogError && <p className="text-sm text-destructive">{dialogError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetting(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void saveReset()}>Redefinir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}
