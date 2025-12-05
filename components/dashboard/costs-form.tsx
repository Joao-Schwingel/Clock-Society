"use client"

import type React from "react"

import { useState } from "react"
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
import type { Cost } from "@/lib/types"

interface CostsFormProps {
  companyId: string
  userId: string
  cost: Cost | null
  onSuccess: () => void
  onCancel: () => void
}

const CATEGORIES = [
  "Aluguel",
  "Salários",
  "Fornecedores",
  "Energia",
  "Água",
  "Internet",
  "Telefone",
  "Marketing",
  "Transporte",
  "Manutenção",
  "Impostos",
  "Seguros",
  "Outros",
]

const PAYMENT_METHODS = [
  "Dinheiro",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência",
  "PIX",
  "Boleto",
  "Cheque",
]

export function CostsForm({ companyId, userId, cost, onSuccess, onCancel }: CostsFormProps) {
  const [category, setCategory] = useState(cost?.category || "")
  const [description, setDescription] = useState(cost?.description || "")
  const [amount, setAmount] = useState(cost?.amount.toString() || "")
  const [costDate, setCostDate] = useState(cost?.cost_date || new Date().toISOString().split("T")[0])
  const [paymentMethod, setPaymentMethod] = useState(cost?.payment_method || "")
  const [notes, setNotes] = useState(cost?.notes || "")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const supabase = createClient()

    const costData = {
      company_id: companyId,
      category,
      description,
      amount: Number.parseFloat(amount),
      cost_date: costDate,
      payment_method: paymentMethod || null,
      notes: notes || null,
      user_id: userId,
    }

    try {
      if (cost) {
        // Update existing cost
        const { error } = await supabase.from("costs").update(costData).eq("id", cost.id)

        if (error) throw error
      } else {
        // Insert new cost
        const { error } = await supabase.from("costs").insert([costData])

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
          <DialogTitle>{cost ? "Editar Custo" : "Novo Custo"}</DialogTitle>
          <DialogDescription>
            {cost ? "Atualize os detalhes do custo" : "Adicione um novo custo ao registro"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select value={category} onValueChange={setCategory} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Descrição *</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o custo"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="costDate">Data do Custo *</Label>
              <Input
                id="costDate"
                type="date"
                value={costDate}
                onChange={(e) => setCostDate(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="paymentMethod">Forma de Pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Salvando..." : cost ? "Atualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
