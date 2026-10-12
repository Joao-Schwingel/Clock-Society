"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, Users } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/client"
import type { Company, Salesperson } from "@/lib/types"

interface SettingsModalProps {
  companies: Company[]
  onClose: () => void
}

export function SettingsModal({ companies, onClose }: SettingsModalProps) {
  const [salespersons, setSalespersons] = useState<Salesperson[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingSalesperson, setEditingSalesperson] = useState<Salesperson | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list')
  // Registros de vendedor que têm login (Fase 6, fatia 6.7; V-UI-09)
  const [withLogin, setWithLogin] = useState<Set<string>>(new Set())

  // Form state
  const [name, setName] = useState("")
  // 022: a pessoa atende N empresas. O percentual não mora mais aqui — é digitado na venda.
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [isActive, setIsActive] = useState(true)
  // acessos por pessoa, para a lista e para a edição
  const [acessos, setAcessos] = useState<Record<string, string[]>>({})
  const supabase = useMemo(() => createBrowserClient(), [])


  useEffect(() => {
    loadSalespersons()
  }, [])

  const loadSalespersons = async () => {
    const { data, error } = await supabase
      .from("salespersons")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error && data) {
      setSalespersons(data)
      // 022: o login é uma coluna da própria pessoa (1:1)
      setWithLogin(new Set(data.filter((sp: Salesperson) => sp.profile_id).map((sp: Salesperson) => sp.id)))
    }

    const { data: vinculos } = await supabase
      .from("salesperson_companies")
      .select("salesperson_id, company_id")
    const porPessoa: Record<string, string[]> = {}
    for (const v of (vinculos ?? []) as { salesperson_id: string; company_id: string }[]) {
      ;(porPessoa[v.salesperson_id] ??= []).push(v.company_id)
    }
    setAcessos(porPessoa)
  }

  const resetForm = () => {
    setName("")
    setCompanyIds([])
    setIsActive(true)
    setEditingSalesperson(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // 022: pessoa sem nenhum acesso não aparece em venda, comissão nem filtro — não deixa salvar
    if (companyIds.length === 0) return
    setIsLoading(true)

    try {
      let id = editingSalesperson?.id
      if (editingSalesperson) {
        const { error } = await supabase
          .from("salespersons")
          .update({ name, is_active: isActive })
          .eq("id", editingSalesperson.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from("salespersons")
          .insert([{ name, is_active: isActive }])
          .select("id")
          .single()
        if (error) throw error
        id = data.id as string
      }

      // acessos: insere os que faltam, remove os que saíram
      const atuais = new Set(acessos[id!] ?? [])
      const novos = companyIds.filter((c) => !atuais.has(c))
      const removidos = [...atuais].filter((c) => !companyIds.includes(c))
      if (novos.length > 0) {
        const { error } = await supabase
          .from("salesperson_companies")
          .insert(novos.map((company_id) => ({ salesperson_id: id, company_id })))
        if (error) throw error
      }
      if (removidos.length > 0) {
        const { error } = await supabase
          .from("salesperson_companies")
          .delete()
          .eq("salesperson_id", id)
          .in("company_id", removidos)
        if (error) throw error
      }

      await loadSalespersons()
      setActiveTab('list')
    } catch (err) {
      console.error("Error saving salesperson:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (salesperson: Salesperson) => {
    setEditingSalesperson(salesperson)
    setName(salesperson.name)
    setCompanyIds(acessos[salesperson.id] ?? [])
    setIsActive(salesperson.is_active)
    setShowForm(true)
    setActiveTab('add')
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este vendedor?")) return

    const { error } = await supabase.from("salespersons").delete().eq("id", id)

    if (!error) {
      await loadSalespersons()
    }
  }

  const getCompanyName = (companyId: string) => {
    return companies.find((c) => c.id === companyId)?.name || "N/A"
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Configurações - Vendedores
          </DialogTitle>
          <DialogDescription>Gerencie os vendedores, suas empresas e porcentagens de comissão</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "list" | "add")} defaultValue="list">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" onClick={() => setShowForm(false)}>
              Lista de Vendedores
            </TabsTrigger>
            <TabsTrigger value="add" onClick={() => setShowForm(true)}>
              {editingSalesperson ? "Editar Vendedor" : "Adicionar Vendedor"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {salespersons.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum vendedor cadastrado</p>
                <p className="text-sm">Clique em "Adicionar Vendedor" para começar</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salespersons.map((salesperson) => (
                      <TableRow key={salesperson.id}>
                        <TableCell className="font-medium">
                          {salesperson.name}
                          {withLogin.has(salesperson.id) && (
                            <Badge variant="outline" className="ml-2">
                              Com login
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {(acessos[salesperson.id] ?? []).length === 0
                            ? "—"
                            : (acessos[salesperson.id] ?? []).map(getCompanyName).join(", ")}
                        </TableCell>
                        <TableCell>
                          {salesperson.is_active ? (
                            <Badge variant="default">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(salesperson)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(salesperson.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="add">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do Vendedor *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: João Silva"
                  required
                />
              </div>

              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Empresas em que atende *</legend>
                <p className="text-sm text-muted-foreground">
                  A mesma pessoa pode atender mais de uma empresa — um cadastro só.
                </p>
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={companyIds.includes(company.id)}
                      onCheckedChange={() =>
                        setCompanyIds((prev) =>
                          prev.includes(company.id)
                            ? prev.filter((c) => c !== company.id)
                            : [...prev, company.id],
                        )
                      }
                    />
                    {company.name}
                  </label>
                ))}
                {companyIds.length === 0 && (
                  <p className="text-sm text-destructive" role="alert">
                    Marque pelo menos uma empresa — sem acesso, a pessoa não aparece em venda nenhuma.
                  </p>
                )}
              </fieldset>

              <div className="grid gap-2">
                <Label htmlFor="status">Status *</Label>
                <Select value={isActive ? "true" : "false"} onValueChange={(v) => setIsActive(v === "true")}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativo</SelectItem>
                    <SelectItem value="false">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading || companyIds.length === 0}>
                  {isLoading ? "Salvando..." : editingSalesperson ? "Atualizar" : "Adicionar"}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
