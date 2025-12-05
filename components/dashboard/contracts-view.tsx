"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import type { Contract } from "@/lib/types"
import { ContractsForm } from "./contracts-form"
import { ContractsTable } from "./contracts-table"
import { FileText, DollarSign, Calendar } from "lucide-react"

interface ContractsViewProps {
  userId: string
}

export function ContractsView({ userId }: ContractsViewProps) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  const fetchContracts = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })

    if (!error && data) {
      setContracts(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchContracts()
  }, [userId])

  const totalMonthly = contracts.reduce((sum, contract) => {
    return sum + (contract.monthly_value - (contract.discount || 0))
  }, 0)

  const totalDiscount = contracts.reduce((sum, contract) => sum + (contract.discount || 0), 0)

  const activeContracts = contracts.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold">Contratos e Custos Fixos</h2>
        <p className="text-muted-foreground">Gerencie contratos, aluguéis, terceirizados e outros custos fixos</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {totalMonthly.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Valor após descontos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos Ativos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeContracts}</div>
            <p className="text-xs text-muted-foreground">Total de contratos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Descontos Totais</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {totalDiscount.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Economia mensal</p>
          </CardContent>
        </Card>
      </div>

      {/* Add New Contract Form */}
      <Card>
        <CardHeader>
          <CardTitle>Adicionar Novo Contrato</CardTitle>
          <CardDescription>Cadastre um novo custo fixo mensal</CardDescription>
        </CardHeader>
        <CardContent>
          <ContractsForm userId={userId} onSuccess={fetchContracts} />
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Contratos</CardTitle>
          <CardDescription>Todos os custos fixos cadastrados</CardDescription>
        </CardHeader>
        <CardContent>
          <ContractsTable contracts={contracts} onUpdate={fetchContracts} loading={loading} />
        </CardContent>
      </Card>
    </div>
  )
}
