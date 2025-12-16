"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import type { Sale, SaleCost } from "@/lib/types"
import { SaleCostForm } from "./sale-cost-form"

interface SaleDetailsModalProps {
  sale: Sale
  isOpen: boolean
  onSuccess: () => void
  onClose: () => void
}

export function SaleDetailsModal({ sale, isOpen, onClose, onSuccess }: SaleDetailsModalProps) {
  const [costs, setCosts] = useState<SaleCost[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCosts = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("sale_costs")
      .select("*")
      .eq("sale_id", sale.id)
      .order("created_at", { ascending: false })

    if (data) {
      setCosts(data)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    if (isOpen) {
      fetchCosts()
    }
  }, [isOpen, sale.id])

  const handleDeleteCost = async (costId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("sale_costs").delete().eq("id", costId)

    if (!error) {
      fetchCosts()
      handleFormSuccess()
    }
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    fetchCosts()
    onSuccess()
  }

  const totalCosts = costs.reduce((sum, cost) => sum + Number(cost.amount), 0)
  const netProfit = Number(sale.total_price) - totalCosts

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg md:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Venda</DialogTitle>
          <DialogDescription>Visualize informações completas e custos extras desta venda</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Sale Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações da Venda</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Produto</p>
                <p className="font-medium">{sale.product_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cliente</p>
                <p className="font-medium">{sale.customer_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vendedor</p>
                <p className="font-medium">{sale.salesperson}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data</p>
                <p className="font-medium">{new Date(sale.sale_date).toLocaleDateString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Quantidade</p>
                <p className="font-medium">{sale.quantity}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Preço Unitário</p>
                <p className="font-medium">
                  R$ {Number(sale.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                <p className="font-bold text-lg">
                  R$ {Number(sale.total_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              {sale.notes && (
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">Observações</p>
                  <p className="font-medium">{sale.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Costs Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Custos Extras</CardTitle>
                <Button size="sm" onClick={() => setIsFormOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Custo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center text-muted-foreground py-4">Carregando...</p>
              ) : costs.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">Nenhum custo extra registrado</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">{cost.cost_type}</TableCell>
                        <TableCell>{cost.description || "-"}</TableCell>
                        <TableCell className="text-right">
                          R$ {Number(cost.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Tem certeza que deseja excluir este custo?")) {
                                handleDeleteCost(cost.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo Financeiro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor da Venda:</span>
                <span className="font-medium">
                  R$ {Number(sale.total_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de Custos:</span>
                <span className="font-medium text-destructive">
                  - R$ {totalCosts.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="font-bold">Lucro Líquido:</span>
                <span className={`font-bold text-lg ${netProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                  R$ {netProfit.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </CardContent>
          </Card>
          <Button onClick={onClose} className="justify-self-end flex">Concluir</Button>
        </div>

        {isFormOpen && (
          <SaleCostForm saleId={sale.id} onSuccess={handleFormSuccess} onCancel={() => setIsFormOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
