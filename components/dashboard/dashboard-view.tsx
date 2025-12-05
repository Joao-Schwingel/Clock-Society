"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import type { Salesperson } from "@/lib/types"
import { DollarSign, TrendingUp, Users, TrendingDown, Receipt, Banknote } from "lucide-react"

interface DashboardViewProps {
  companyId: string
  userId: string
}

interface SalespersonCommission {
  salesperson: Salesperson
  totalSales: number
  totalCosts: number
  netProfit: number
  commission: number
  salesCount: number
}

export function DashboardView({ companyId, userId }: DashboardViewProps) {
  const [commissions, setCommissions] = useState<SalespersonCommission[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalCommissions, setTotalCommissions] = useState(0)
  const [totalSaleCosts, setTotalSaleCosts] = useState(0)
  const [totalFixedCosts, setTotalFixedCosts] = useState(0)
  const [netProfit, setNetProfit] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadCommissionData()
  }, [companyId, userId])

  const loadCommissionData = async () => {
    const supabase = createClient()

    try {
      const { data: salespersons, error: salespersonsError } = await supabase
        .from("salespersons")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("name")

      if (salespersonsError) throw salespersonsError

      const { data: sales, error } = await supabase
        .from("sales")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("status", "concluída")

      if (error) throw error

      const saleIds = sales?.map((s) => s.id) || []
      const { data: saleCosts } = await supabase.from("sale_costs").select("*").in("sale_id", saleIds)

      const { data: fixedCosts } = await supabase
        .from("fixed_costs")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)

      const saleCostsTotal = saleCosts?.reduce((sum, cost) => sum + Number(cost.amount), 0) || 0
      const fixedCostsTotal = fixedCosts?.reduce((sum, cost) => sum + Number(cost.monthly_amount), 0) || 0

      const salesByPerson: Record<
        string,
        { totalSales: number; totalCosts: number; netProfit: number; count: number }
      > = {}

      // Initialize for each salesperson
      for (const person of salespersons || []) {
        salesByPerson[person.id] = { totalSales: 0, totalCosts: 0, netProfit: 0, count: 0 }
      }

      let revenue = 0

      for (const sale of sales || []) {
        const saleValue = Number(sale.total_price)
        revenue += saleValue

        // Get costs for this specific sale
        const costsForSale = saleCosts?.filter((c) => c.sale_id === sale.id) || []
        const costTotal = costsForSale.reduce((sum, c) => sum + Number(c.amount), 0)
        const saleNetProfit = saleValue - costTotal

        // Check if this salesperson exists in our records
        if (sale.salesperson_id && salesByPerson[sale.salesperson_id]) {
          salesByPerson[sale.salesperson_id].totalSales += saleValue
          salesByPerson[sale.salesperson_id].totalCosts += costTotal
          salesByPerson[sale.salesperson_id].netProfit += saleNetProfit
          salesByPerson[sale.salesperson_id].count += 1
        }
      }

      const commissionData: SalespersonCommission[] = (salespersons || []).map((person) => {
        const personData = salesByPerson[person.id] || { totalSales: 0, totalCosts: 0, netProfit: 0, count: 0 }
        const commissionRate = Number(person.commission_percentage) / 100

        return {
          salesperson: person,
          totalSales: personData.totalSales,
          totalCosts: personData.totalCosts,
          netProfit: personData.netProfit,
          commission: personData.netProfit * commissionRate,
          salesCount: personData.count,
        }
      })

      const totalComm = commissionData
        .filter((c) => c.salesperson.commission_percentage > 0)
        .reduce((sum, c) => sum + c.commission, 0)
      const overallNetProfit = revenue - saleCostsTotal - fixedCostsTotal

      setCommissions(commissionData)
      setTotalRevenue(revenue)
      setTotalCommissions(totalComm)
      setTotalSaleCosts(saleCostsTotal)
      setTotalFixedCosts(fixedCostsTotal)
      setNetProfit(overallNetProfit)
    } catch (err) {
      console.error("Error loading commission data:", err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">Carregando...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Dashboard de Comissões</h3>
        <p className="text-muted-foreground">Comissões sobre lucro líquido (apenas vendas concluídas)</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Vendas concluídas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custos de Vendas</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              R$ {totalSaleCosts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Transporte, tarifas, etc</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custos Fixos</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              R$ {totalFixedCosts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Salários, aluguel, etc</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lucro Líquido</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              R$ {netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">Após todos os custos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comissões Totais</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {totalCommissions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground">10% do lucro líquido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendedores Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{commissions.filter((c) => c.salesCount > 0).length}</div>
            <p className="text-xs text-muted-foreground">Com vendas concluídas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {commissions.length > 0 ? (
          commissions.map((commission) => (
            <Card key={commission.salesperson.id}>
              <CardHeader>
                <CardTitle>{commission.salesperson.name}</CardTitle>
                <CardDescription>
                  {commission.salesCount} venda{commission.salesCount !== 1 ? "s" : ""} concluída
                  {commission.salesCount !== 1 ? "s" : ""}
                  {commission.salesperson.commission_percentage > 0
                    ? ` • Comissão de ${commission.salesperson.commission_percentage}%`
                    : " • Sem comissão"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total de Vendas:</span>
                    <span className="font-medium">
                      R$ {commission.totalSales.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Custos das Vendas:</span>
                    <span className="font-medium text-orange-600">
                      - R$ {commission.totalCosts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Lucro Líquido:</span>
                    <span className="font-medium text-green-600">
                      R$ {commission.netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {commission.salesperson.commission_percentage > 0 && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-sm text-muted-foreground">
                        Comissão ({commission.salesperson.commission_percentage}% do lucro líquido):
                      </span>
                      <span className="text-xl font-bold text-primary">
                        R$ {commission.commission.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <div className="text-xs text-muted-foreground">
                    Média por venda:{" "}
                    <span className="font-medium text-foreground">
                      R${" "}
                      {commission.salesCount > 0
                        ? (commission.totalSales / commission.salesCount).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })
                        : "0,00"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="col-span-2">
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>Nenhum vendedor ativo cadastrado.</p>
              <p className="text-sm mt-2">Use o botão de configurações para adicionar vendedores.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
