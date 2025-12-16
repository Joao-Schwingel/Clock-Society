"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Plus,
  DollarSign,
  TrendingUp,
  Receipt,
  TrendingDown,
  Clock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Sale } from "@/lib/types";
import { SalesForm } from "./sales-form";
import { SalesTable } from "./sales-table";
import { SaleDetailsModal } from "./sale-details-modal";
import { Spinner } from "@radix-ui/themes";

interface SalesViewProps {
  companyId: string;
  userId: string;
}

export function SalesView({ companyId, userId }: SalesViewProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [totalSaleCosts, setTotalSaleCosts] = useState(0);
  const [pendingSaleCosts, setPendingSaleCosts] = useState(0);

  const fetchSales = async () => {
    setIsLoading(true)
    const supabase = createClient();
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .eq("company_id", companyId)
      .order("sale_date", { ascending: false });

    if (data) {
      setSales(data);
      const saleIds = data.map((s) => s.id);
      const { data: costsData } = await supabase
        .from("sale_costs")
        .select("*")
        .in("sale_id", saleIds);

      const completedSaleIds = data
        .filter((s) => s.status === "concluída")
        .map((s) => s.id);
      const pendingSaleIds = data
        .filter((s) => s.status === "pendente")
        .map((s) => s.id);

      const completedCostsTotal =
        costsData
          ?.filter((c) => completedSaleIds.includes(c.sale_id))
          .reduce((sum, cost) => sum + Number(cost.amount), 0) || 0;
      const pendingCostsTotal =
        costsData
          ?.filter((c) => pendingSaleIds.includes(c.sale_id))
          .reduce((sum, cost) => sum + Number(cost.amount), 0) || 0;

      setTotalSaleCosts(completedCostsTotal);
      setPendingSaleCosts(pendingCostsTotal);
    }
    setIsLoading(false);
  };

  const handleAdd = () => {
    setEditingSale(null);
    setIsFormOpen(true);
  };

  const handleEdit = (sale: Sale) => {
    setEditingSale(sale);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("sales").delete().eq("id", id);

    if (!error) {
      fetchSales();
    }
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingSale(null);
    fetchSales();
  };

  const handleViewDetails = (sale: Sale) => {
    setViewingSale(sale);
  };

  const handleStatusChange = () => {
    fetchSales();
  };

  const completedSales = sales.filter((s) => s.status === "concluída");
  const pendingSales = sales.filter((s) => s.status === "pendente");

  const { completedRevenue, pendingRevenue } = useMemo(() => {
    const completed = sales
      .filter((s) => s.status === "concluída")
      .reduce((sum, sale) => sum + Number(sale.total_price), 0);

    const pending = sales
      .filter((s) => s.status === "pendente")
      .reduce((sum, sale) => sum + Number(sale.total_price), 0);

    return {
      completedRevenue: completed,
      pendingRevenue: pending,
    };
  }, [sales]);

  const completedNetProfit = completedRevenue - totalSaleCosts;
  const pendingNetProfit = pendingRevenue - pendingSaleCosts;

  useEffect(() => {
    fetchSales();
  }, [companyId]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2 text-green-600">
          Vendas Concluídas
        </h3>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Receita Concluída
              </CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  R${" "}
                  {completedRevenue.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>

                <p className="text-xs text-muted-foreground">
                  {completedSales.length} vendas aprovadas
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Custos Concluídos
              </CardTitle>
              <Receipt className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  R${" "}
                  {totalSaleCosts.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Custos de vendas aprovadas
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Lucro Líquido Concluído
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    completedNetProfit >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  R${" "}
                  {completedNetProfit.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Receita - Custos
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-green-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Items Vendidos
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold">
                  {completedSales.reduce((sum, sale) => sum + sale.quantity, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quantidade total
                </p>
              </CardContent>
            </Spinner>
          </Card>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2 text-yellow-600">
          Vendas Pendentes
        </h3>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Receita Pendente
              </CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  R${" "}
                  {pendingRevenue.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {pendingSales.length} vendas aguardando
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Custos Pendentes
              </CardTitle>
              <Receipt className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  R${" "}
                  {pendingSaleCosts.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Custos de vendas pendentes
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Lucro Líquido Pendente
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div
                  className={`text-2xl font-bold ${
                    pendingNetProfit >= 0 ? "text-yellow-600" : "text-red-600"
                  }`}
                >
                  R${" "}
                  {pendingNetProfit.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Receita - Custos
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-yellow-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Items Pendentes
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold">
                  {pendingSales.reduce((sum, sale) => sum + sale.quantity, 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Quantidade aguardando
                </p>
              </CardContent>
            </Spinner>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Vendas</CardTitle>
              <CardDescription>
                Gerencie as vendas desta empresa
              </CardDescription>
            </div>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Venda
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <SalesTable
            sales={sales}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onViewDetails={handleViewDetails}
            onStatusChange={handleStatusChange}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {isFormOpen && (
        <SalesForm
          companyId={companyId}
          userId={userId}
          sale={editingSale}
          onSuccess={handleFormSuccess}
          onCancel={() => setIsFormOpen(false)}
        />
      )}

      {viewingSale && (
        <SaleDetailsModal
          sale={viewingSale}
          isOpen={!!viewingSale}
          onSuccess={handleFormSuccess}
          onClose={() => setViewingSale(null)}
        />
      )}
    </div>
  );
}
