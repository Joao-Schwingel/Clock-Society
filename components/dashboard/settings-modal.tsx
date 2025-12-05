"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, Users } from "lucide-react"
import { createBrowserClient } from "@/lib/supabase/client"
import type { Company, Salesperson } from "@/lib/types"

interface SettingsModalProps {
  userId: string
  companies: Company[]
  onClose: () => void
}

export function SettingsModal({ userId, companies, onClose }: SettingsModalProps) {
  const [salespersons, setSalespersons] = useState<Salesperson[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingSalesperson, setEditingSalesperson] = useState<Salesperson | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [name, setName] = useState("")
  const [companyId, setCompanyId] = useState(companies[0]?.id || "")
  const [commissionPercentage, setCommissionPercentage] = useState("10")
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    loadSalespersons()
  }, [])

  const loadSalespersons = async () => {
    const supabase = createBrowserClient()
    const { data, error } = await supabase
      .from("salespersons")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (!error && data) {
      setSalespersons(data)
    }
  }

  const resetForm = () => {
    setName("")
    setCompanyId(companies[0]?.id || "")
    setCommissionPercentage("10")
    setIsActive(true)
    setEditingSalesperson(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const supabase = createBrowserClient()
    const salespersonData = {
      name,
      company_id: companyId,
      commission_percentage: Number.parseFloat(commissionPercentage),
      is_active: isActive,
      user_id: userId,
    }

    try {
      if (editingSalesperson) {
        const { error } = await supabase.from("salespersons").update(salespersonData).eq("id", editingSalesperson.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("salespersons").insert([salespersonData])

        if (error) throw error
      }

      await loadSalespersons()
      resetForm()
    } catch (err) {
      console.error("Error saving salesperson:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (salesperson: Salesperson) => {
    setEditingSalesperson(salesperson)
    setName(salesperson.name)
    setCompanyId(salesperson.company_id)
    setCommissionPercentage(salesperson.commission_percentage.toString())
    setIsActive(salesperson.is_active)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este vendedor?")) return

    const supabase = createBrowserClient()
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

        <Tabs defaultValue="list">
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
                      <TableHead>Comissão (%)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salespersons.map((salesperson) => (
                      <TableRow key={salesperson.id}>
                        <TableCell className="font-medium">{salesperson.name}</TableCell>
                        <TableCell>{getCompanyName(salesperson.company_id)}</TableCell>
                        <TableCell>{salesperson.commission_percentage}%</TableCell>
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

              <div className="grid gap-2">
                <Label htmlFor="company">Empresa *</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger id="company">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="commission">Porcentagem de Comissão (%) *</Label>
                <Input
                  id="commission"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={commissionPercentage}
                  onChange={(e) => setCommissionPercentage(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">Comissão sobre o lucro líquido de cada venda</p>
              </div>

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
                <Button type="submit" disabled={isLoading}>
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
