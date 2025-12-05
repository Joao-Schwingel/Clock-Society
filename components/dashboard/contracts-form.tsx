"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface ContractsFormProps {
  userId: string
  onSuccess: () => void
}

export function ContractsForm({ userId, onSuccess }: ContractsFormProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    monthly_value: "",
    start_date: "",
    discount: "",
    description: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.from("contracts").insert({
      user_id: userId,
      name: formData.name,
      monthly_value: Number.parseFloat(formData.monthly_value),
      start_date: formData.start_date,
      discount: formData.discount ? Number.parseFloat(formData.discount) : 0,
      description: formData.description || null,
    })

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o contrato.",
        variant: "destructive",
      })
    } else {
      toast({
        title: "Sucesso",
        description: "Contrato adicionado com sucesso!",
      })
      setFormData({
        name: "",
        monthly_value: "",
        start_date: "",
        discount: "",
        description: "",
      })
      onSuccess()
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Nome do Contrato *</Label>
          <Input
            id="name"
            placeholder="Ex: Aluguel, Contador, Limpeza..."
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="monthly_value">Valor Mensal (R$) *</Label>
          <Input
            id="monthly_value"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.monthly_value}
            onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_date">Data de Início *</Label>
          <Input
            id="start_date"
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="discount">Desconto (R$)</Label>
          <Input
            id="discount"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.discount}
            onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          placeholder="Detalhes adicionais sobre o contrato..."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Adicionando..." : "Adicionar Contrato"}
      </Button>
    </form>
  )
}
