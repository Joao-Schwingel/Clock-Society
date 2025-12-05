"use client"

import type React from "react"

import { useState } from "react"
import { createBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface FixedCostFormProps {
  companyId: string
  userId: string
  onFixedCostAdded: () => void
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

export function FixedCostForm({ companyId, userId, onFixedCostAdded }: FixedCostFormProps) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [monthlyValue, setMonthlyValue] = useState("")
  const [startDate, setStartDate] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const supabase = createBrowserClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const { error } = await supabase.from("fixed_costs").insert({
      company_id: companyId,
      user_id: userId,
      name,
      category,
      monthly_value: Number(monthlyValue),
      start_date: startDate,
      description: description || null,
    })

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o custo fixo.",
        variant: "destructive",
      })
    } else {
      toast({
        title: "Sucesso",
        description: "Custo fixo adicionado com sucesso!",
      })
      setName("")
      setCategory("")
      setMonthlyValue("")
      setStartDate("")
      setDescription("")
      onFixedCostAdded()
    }

    setIsSubmitting(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar Custo Fixo</CardTitle>
        <CardDescription>Cadastre um novo custo fixo mensal para a empresa</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Custo *</Label>
              <Input
                id="name"
                placeholder="Ex: Salário João Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select value={category} onValueChange={setCategory} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {COST_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyValue">Valor Mensal (R$) *</Label>
              <Input
                id="monthlyValue"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={monthlyValue}
                onChange={(e) => setMonthlyValue(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Data de Início *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              placeholder="Detalhes adicionais sobre o custo fixo..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Adicionando..." : "Adicionar Custo Fixo"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
