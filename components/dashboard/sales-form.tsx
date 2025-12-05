"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import type { Sale, Salesperson } from "@/lib/types"

interface SalesFormProps {
  companyId: string
  userId: string
  sale: Sale | null
  onSuccess: () => void
  onCancel: () => void
}

export function SalesForm({ companyId, userId, sale, onSuccess, onCancel }: SalesFormProps) {
  const [productName, setProductName] = useState(sale?.product_name || "")
  const [quantity, setQuantity] = useState(sale?.quantity.toString() || "")
  const [unitPrice, setUnitPrice] = useState(sale?.unit_price.toString() || "")
  const [saleDate, setSaleDate] = useState(sale?.sale_date || new Date().toISOString().split("T")[0])
  const [customerName, setCustomerName] = useState(sale?.customer_name || "")
  const [salespersonId, setSalespersonId] = useState(sale?.salesperson_id || "")
  const [notes, setNotes] = useState(sale?.notes || "")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [salespersons, setSalespersons] = useState<Salesperson[]>([])

  const totalPrice = (Number.parseFloat(quantity || "0") * Number.parseFloat(unitPrice || "0")).toFixed(2)

  useEffect(() => {
    loadSalespersons()
  }, [companyId, userId])

  const loadSalespersons = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("salespersons")
      .select("*")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name")

    if (!error && data) {
      setSalespersons(data)
      if (!sale && data.length > 0 && !salespersonId) {
        setSalespersonId(data[0].id)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const saleData = {
      company_id: companyId,
      product_name: productName,
      quantity: Number.parseInt(quantity),
      unit_price: Number.parseFloat(unitPrice),
      total_price: Number.parseFloat(totalPrice),
      sale_date: saleDate,
      customer_name: customerName || null,
      salesperson_id: salespersonId,
      status: sale?.status || ("pending" as const),
      notes: notes || null,
      user_id: userId,
    }

    try {
      if (sale) {
        const { error } = await supabase.from("sales").update(saleData).eq("id", sale.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("sales").insert([saleData])

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
          <DialogTitle>{sale ? "Editar Venda" : "Nova Venda"}</DialogTitle>
          <DialogDescription>
            {sale ? "Atualize os detalhes da venda" : "Adicione uma nova venda ao registro"}
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
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="unitPrice">Preço Unitário (R$) *</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Preço Total</Label>
              <div className="text-2xl font-bold">
                R$ {Number.parseFloat(totalPrice).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="saleDate">Data da Venda *</Label>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customerName">Nome do Cliente</Label>
              <Input id="customerName" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="salesperson">Vendedor *</Label>
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger id="salesperson">
                  <SelectValue placeholder="Selecione um vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {salespersons.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} ({person.commission_percentage}% comissão)
                    </SelectItem>
                  ))}
                  {salespersons.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nenhum vendedor ativo. Configure vendedores primeiro.
                    </div>
                  )}
                </SelectContent>
              </Select>
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
            <Button type="submit" disabled={isLoading || salespersons.length === 0}>
              {isLoading ? "Salvando..." : sale ? "Atualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
