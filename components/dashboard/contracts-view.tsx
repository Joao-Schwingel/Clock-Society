"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import type { Contract } from "@/lib/types"
import { ContractsForm } from "./contracts-form"
import { ContractsTable } from "./contracts-table"
import { FileText, DollarSign, CalendarOff } from "lucide-react"
import { summarizeContracts } from "@/lib/calc/contracts"

interface ContractsViewProps {
}

export function ContractsView() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  const fetchContracts = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("contracts")
      .select("*")
      .order("start_date", { ascending: false })

    if (!error && data) {
      setContracts(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchContracts()
  }, [])

  const today = new Date().toISOString().split("T")[0]
  const currentYear = new Date().getFullYear()

  const { activeCount, totalMonthly, totalAnnual } = summarizeContracts(
    contracts,
    today,
    currentYear,
  )

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold">Contratos</h2>
        <p className="text-muted-foreground">
          Gerencie contratos, aluguéis, terceirizados e outros custos fixos
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {fmt(totalMonthly)}</div>
            <p className="text-xs text-muted-foreground">Contratos ativos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contratos Ativos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
            <p className="text-xs text-muted-foreground">
              {contracts.length - activeCount > 0
                ? `${contracts.length - activeCount} encerrado(s)`
                : "Todos em vigor"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Anual</CardTitle>
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">R$ {fmt(totalAnnual)}</div>
            <p className="text-xs text-muted-foreground">Meses ativos em {currentYear}</p>
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
          <ContractsForm onSuccess={fetchContracts} />
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Contratos</CardTitle>
          <CardDescription>Todos os contratos cadastrados</CardDescription>
        </CardHeader>
        <CardContent>
          <ContractsTable contracts={contracts} onUpdate={fetchContracts} loading={loading} />
        </CardContent>
      </Card>
    </div>
  )
}
