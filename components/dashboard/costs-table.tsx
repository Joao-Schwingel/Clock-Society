"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Pencil, Trash2, Search } from "lucide-react"
import type { Cost } from "@/lib/types"

interface CostsTableProps {
  costs: Cost[]
  onEdit: (cost: Cost) => void
  onDelete: (id: string) => void
  isLoading: boolean
}

export function CostsTable({ costs, onEdit, onDelete, isLoading }: CostsTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [dateFilter, setDateFilter] = useState("")

  const filteredCosts = useMemo(() => {
    return costs.filter((cost) => {
      const matchesSearch =
        cost.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cost.category.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesCategory = !categoryFilter || cost.category === categoryFilter
      const matchesDate = !dateFilter || cost.cost_date.startsWith(dateFilter)

      return matchesSearch && matchesCategory && matchesDate
    })
  }, [costs, searchTerm, categoryFilter, dateFilter])

  const categories = useMemo(() => {
    return Array.from(new Set(costs.map((cost) => cost.category)))
  }, [costs])

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="month" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="w-48" />
        {(searchTerm || categoryFilter !== "all" || dateFilter) && (
          <Button
            variant="outline"
            onClick={() => {
              setSearchTerm("")
              setCategoryFilter("all")
              setDateFilter("")
            }}
          >
            Limpar
          </Button>
        )}
      </div>

      {filteredCosts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {costs.length === 0 ? "Nenhum custo registrado ainda." : "Nenhum resultado encontrado."}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Forma de Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCosts.map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell>{new Date(cost.cost_date).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{cost.category}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{cost.description}</TableCell>
                  <TableCell>{cost.payment_method || "-"}</TableCell>
                  <TableCell className="text-right font-medium">
                    R$ {Number(cost.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => onEdit(cost)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("Tem certeza que deseja excluir este custo?")) {
                            onDelete(cost.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
