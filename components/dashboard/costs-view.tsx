"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, DollarSign, TrendingDown, Receipt } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Cost } from "@/lib/types"
import { CostsForm } from "./costs-form"
import { CostsTable } from "./costs-table"

interface CostsViewProps {
  companyId: string
  userId: string
}

export function CostsView({ companyId, userId }: CostsViewProps) {
  const [costs, setCosts] = useState<Cost[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCost, setEditingCost] = useState<Cost | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCosts = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("costs")
      .select("*")
      .eq("company_id", companyId)
      .order("cost_date", { ascending: false })

    if (data) {
      setCosts(data)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchCosts()
  }, [companyId])

  const handleAdd = () => {
    setEditingCost(null)
    setIsFormOpen(true)
  }

  const handleEdit = (cost: Cost) => {
    setEditingCost(cost)
    setIsFormOpen(true)
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("costs").delete().eq("id", id)

    if (!error) {
      fetchCosts()
    }
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    setEditingCost(null)
    fetchCosts()
  }

  // Calculate totals
  const totalCosts = costs.reduce((sum, cost) => sum + Number(cost.amount), 0)
  const totalEntries = costs.length

  // Group costs by category
  const costsByCategory = costs.reduce(
    (acc, cost) => {
      acc[cost.category] = (acc[cost.category] || 0) + Number(cost.amount)
      return acc
    },
    {} as Record<string, number>,
  )

  const topCategory = Object.entries(costsByCategory).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custos Totais</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {totalCosts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Lançamentos</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEntries}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maior Categoria</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{topCategory?.[0] || "-"}</div>
            {topCategory && (
              <p className="text-xs text-muted-foreground">
                R$ {topCategory[1].toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Costs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Custos</CardTitle>
              <CardDescription>Gerencie os custos desta empresa</CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Custo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <CostsTable costs={costs} onEdit={handleEdit} onDelete={handleDelete} isLoading={isLoading} />
        </CardContent>
      </Card>

      {/* Costs Form Modal */}
      {isFormOpen && (
        <CostsForm
          companyId={companyId}
          userId={userId}
          cost={editingCost}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      )}
    </div>
  )
}
