"use client"

import type React from "react"
import { useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import type { Company } from "@/lib/types"

export interface SalespersonOption {
  id: string
  name: string
  company_id: string
}

interface UserFormProps {
  companies: Company[]
  salespersons: SalespersonOption[]
  /** Registros que já têm login — não podem ser vinculados de novo (V-API-04). */
  linkedIds: Set<string>
  onClose: () => void
  onCreated: () => void
}

// Cadastro de usuário (Fase 6, fatia 6.7; V-UI-09). Envia para POST /api/users (6.5).
export function UserForm({ companies, salespersons, linkedIds, onClose, onCreated }: UserFormProps) {
  const id = useId()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<"vendedor" | "admin">("vendedor")
  const [selected, setSelected] = useState<string[]>([])
  const [createNew, setCreateNew] = useState(false)
  const [newName, setNewName] = useState("")
  const [newCompany, setNewCompany] = useState(companies[0]?.id ?? "")
  const [withoutSales, setWithoutSales] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const companyName = (companyId: string) => companies.find((c) => c.id === companyId)?.name ?? ""
  const available = salespersons.filter((sp) => !linkedIds.has(sp.id))

  // Aviso ao vincular registro sem vendas (V-UI-09): o vendedor entraria e veria a área vazia.
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const supabase = createClient()
      const empty: string[] = []
      for (const spId of selected) {
        const { count } = await supabase
          .from("sale_salespersons")
          .select("id", { count: "exact", head: true })
          .eq("salesperson_id", spId)
        if ((count ?? 0) === 0) empty.push(spId)
      }
      if (!cancelled) setWithoutSales(empty)
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [selected])

  const toggle = (spId: string) =>
    setSelected((prev) => (prev.includes(spId) ? prev.filter((x) => x !== spId) : [...prev, spId]))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          role,
          salesperson_ids: role === "vendedor" ? selected : [],
          new_salesperson: role === "vendedor" && createNew ? { name: newName, company_id: newCompany } : undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErrors(body.fields ?? {})
        setFormError(body.fields ? null : (body.error ?? "Não foi possível criar o usuário."))
        return
      }
      onCreated()
    } catch {
      setFormError("Não foi possível criar o usuário.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            O usuário entra com a senha temporária e é obrigado a trocá-la no primeiro acesso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Nome *</Label>
            <Input id={`${id}-name`} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            {errors.full_name && <p className="text-sm text-destructive">{errors.full_name}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-email`}>E-mail *</Label>
            <Input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-password`}>Senha temporária *</Label>
            <Input id={`${id}-password`} type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-role`}>Papel *</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "vendedor" | "admin")}>
              <SelectTrigger id={`${id}-role`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vendedor">Vendedor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "vendedor" && (
            <fieldset className="space-y-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">Vendedor vinculado *</legend>
              {available.length === 0 && (
                <p className="text-sm text-muted-foreground">Todos os registros de vendedor já têm login.</p>
              )}
              {available.map((sp) => (
                <label key={sp.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selected.includes(sp.id)} onCheckedChange={() => toggle(sp.id)} />
                  {sp.name} ({companyName(sp.company_id)})
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={createNew} onCheckedChange={(v) => setCreateNew(v === true)} />
                Criar um novo registro de vendedor
              </label>
              {createNew && (
                <div className="grid gap-2 pl-6">
                  <Label htmlFor={`${id}-new-name`}>Nome do novo vendedor *</Label>
                  <Input id={`${id}-new-name`} value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <Label htmlFor={`${id}-new-company`}>Empresa *</Label>
                  <Select value={newCompany} onValueChange={setNewCompany}>
                    <SelectTrigger id={`${id}-new-company`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.new_salesperson && <p className="text-sm text-destructive">{errors.new_salesperson}</p>}
                </div>
              )}
              {withoutSales.length > 0 && (
                <p className="text-sm text-amber-600" role="status">
                  {withoutSales
                    .map((spId) => salespersons.find((sp) => sp.id === spId)?.name)
                    .join(", ")}{" "}
                  ainda não tem vendas registradas: o vendedor vai entrar e ver a área vazia.
                </p>
              )}
              {errors.salesperson_ids && <p className="text-sm text-destructive">{errors.salesperson_ids}</p>}
            </fieldset>
          )}

          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
