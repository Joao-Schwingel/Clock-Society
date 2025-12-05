"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

interface SaleCostFormProps {
  saleId: string
  onSuccess: () => void
  onCancel: () => void
}

const COST_TYPES = ["Transporte", "Tarifas", "Comissão Extra", "Embalagem", "Impostos", "Frete", "Seguro", "Outros"]

export function SaleCostForm({ saleId, onSuccess, onCancel }: SaleCostFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    cost_type: "",
    description: "",
    amount: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      alert("Você precisa estar logado")
      setIsSubmitting(false)
      return
    }

    const { error } = await supabase.from("sale_costs").insert({
      sale_id: saleId,
      cost_type: formData.cost_type,
      description: formData.description || null,
      amount: Number.parseFloat(formData.amount),
      user_id: user.id,
    })

    if (error) {
      alert("Erro ao adicionar custo: " + error.message)
      setIsSubmitting(false)
    } else {
      onSuccess()
    }
  }

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Custo Extra</DialogTitle>
          <DialogDescription>Registre custos adicionais relacionados a esta venda</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cost_type">Tipo de Custo *</Label>
            <Select
              value={formData.cost_type}
              onValueChange={(value) => setFormData({ ...formData, cost_type: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {COST_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Valor (R$) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detalhes sobre o custo..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
