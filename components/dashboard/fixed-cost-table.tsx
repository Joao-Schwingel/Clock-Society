"use client"

import { useState } from "react"
import type { FixedCost } from "@/lib/types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface FixedCostTableProps {
  fixedCosts: FixedCost[]
  onDelete: (id: string) => void
  isLoading: boolean
}

const COST_CATEGORIES = [
  "Salários",
  "Aluguel",
  "Tráfego Pago",
  "Software/Assinaturas",
  "Energia",
  "Água",
  "Internet",
  "Telefonia",
  "Contabilidade",
  "Manutenção",
  "Outros",
]

export function FixedCostTable({ fixedCosts, onDelete, isLoading }: FixedCostTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState("")

  const filteredCosts = fixedCosts.filter((cost) => {
    const matchesSearch =
      cost.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cost.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)

    const matchesCategory = categoryFilter === "all" || cost.category === categoryFilter

    const matchesDate = !dateFilter || cost.start_date.startsWith(dateFilter)

    return matchesSearch && matchesCategory && matchesDate
  })

  const clearFilters = () => {
    setSearchTerm("")
    setCategoryFilter("all")
    setDateFilter("")
  }

  const hasActiveFilters = searchTerm || categoryFilter !== "all" || dateFilter

  const totalFiltered = filteredCosts.reduce((sum, cost) => sum + Number(cost.monthly_value), 0)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Custos Fixos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custos Fixos</CardTitle>
        <CardDescription>Lista de todos os custos fixos cadastrados</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Buscar por nome ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {COST_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-2">
              <Label htmlFor="date">Data de Início</Label>
              <Input id="date" type="month" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            </div>

            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="gap-2 bg-transparent">
                <X className="h-4 w-4" />
                Limpar Filtros
              </Button>
            )}
          </div>

          {filteredCosts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {hasActiveFilters
                ? "Nenhum custo fixo encontrado com os filtros aplicados."
                : "Nenhum custo fixo cadastrado ainda."}
            </p>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Valor Mensal</TableHead>
                      <TableHead>Data Início</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCosts.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">{cost.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{cost.category}</Badge>
                        </TableCell>
                        <TableCell>
                          R$ {Number(cost.monthly_value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{new Date(cost.start_date).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="max-w-xs truncate">{cost.description || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDelete(cost.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Mostrando {filteredCosts.length} de {fixedCosts.length} custos fixos
                </p>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Mensal (Filtrado)</p>
                  <p className="text-2xl font-bold">
                    R$ {totalFiltered.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
