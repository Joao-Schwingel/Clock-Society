"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import type { InventoryItem } from "@/lib/types"

interface InventoryFormProps {
  companyId: string
  userId: string
  item: InventoryItem | null
  onSuccess: () => void
  onCancel: () => void
}

export function InventoryForm({ companyId, userId, item, onSuccess, onCancel }: InventoryFormProps) {
  const [productName, setProductName] = useState(item?.product_name || "")
  const [quantity, setQuantity] = useState(item?.quantity.toString() || "")
  const [unitCost, setUnitCost] = useState(item?.unit_cost.toString() || "")
  const [location, setLocation] = useState(item?.location || "")
  const [lastUpdated, setLastUpdated] = useState(item?.last_updated || new Date().toISOString().split("T")[0])
  const [notes, setNotes] = useState(item?.notes || "")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const totalValue = (Number.parseFloat(quantity || "0") * Number.parseFloat(unitCost || "0")).toFixed(2)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const inventoryData = {
      company_id: companyId,
      product_name: productName,
      quantity: Number.parseInt(quantity),
      unit_cost: Number.parseFloat(unitCost),
      total_value: Number.parseFloat(totalValue),
      location: location || null,
      last_updated: lastUpdated,
      notes: notes || null,
      user_id: userId,
    }

    try {
      if (item) {
        // Update existing item
        const { error } = await supabase.from("inventory").update(inventoryData).eq("id", item.id)

        if (error) throw error
      } else {
        // Insert new item
        const { error } = await supabase.from("inventory").insert([inventoryData])

        if (error) throw error
      }

      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{item ? "Editar Item" : "Novo Item"}</DialogTitle>
          <DialogDescription>
            {item ? "Atualize os detalhes do item" : "Adicione um novo item ao estoque"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="productName">Nome do Produto *</Label>
              <Input id="productName" value={productName} onChange={(e) => setProductName(e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantidade *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="unitCost">Custo Unitário (R$) *</Label>
                <Input
                  id="unitCost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Valor Total</Label>
              <div className="text-2xl font-bold">
                R$ {Number.parseFloat(totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="location">Localização</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: Depósito A, Prateleira 3"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="lastUpdated">Última Atualização *</Label>
              <Input
                id="lastUpdated"
                type="date"
                value={lastUpdated}
                onChange={(e) => setLastUpdated(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Salvando..." : item ? "Atualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
