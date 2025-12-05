"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Package, DollarSign, Boxes } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { InventoryItem } from "@/lib/types"
import { InventoryForm } from "./inventory-form"
import { InventoryTable } from "./inventory-table"

interface InventoryViewProps {
  companyId: string
  userId: string
}

export function InventoryView({ companyId, userId }: InventoryViewProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchInventory = async () => {
    const supabase = createClient()
    const { data } = await supabase.from("inventory").select("*").eq("company_id", companyId).order("product_name")

    if (data) {
      setInventory(data)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    fetchInventory()
  }, [companyId])

  const handleAdd = () => {
    setEditingItem(null)
    setIsFormOpen(true)
  }

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item)
    setIsFormOpen(true)
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("inventory").delete().eq("id", id)

    if (!error) {
      fetchInventory()
    }
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    setEditingItem(null)
    fetchInventory()
  }

  // Calculate totals
  const totalValue = inventory.reduce((sum, item) => sum + Number(item.total_value), 0)
  const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0)
  const totalProducts = inventory.length

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Produtos</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quantidade Total</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Estoque</CardTitle>
              <CardDescription>Gerencie o estoque desta empresa</CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <InventoryTable inventory={inventory} onEdit={handleEdit} onDelete={handleDelete} isLoading={isLoading} />
        </CardContent>
      </Card>

      {/* Inventory Form Modal */}
      {isFormOpen && (
        <InventoryForm
          companyId={companyId}
          userId={userId}
          item={editingItem}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      )}
    </div>
  )
}
