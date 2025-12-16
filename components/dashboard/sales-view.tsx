"use client";

import { useEffect, useState } from "react";
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
import type { SaleWithDetails } from "@/lib/types";
import { SalesForm } from "./sales-form";
import { SalesTable } from "./sales-table";
import { SaleDetailsModal } from "./sale-details-modal";
import { Spinner } from "@radix-ui/themes";

interface SalesViewProps {
  companyId: string;
  userId: string;
}

export function SalesView({ companyId, userId }: SalesViewProps) {
  const [sales, setSales] = useState<SaleWithDetails[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleWithDetails | null>(null);
  const [viewingSale, setViewingSale] = useState<SaleWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSales = async () => {
    setIsLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("sales_with_details")
      .select(
        "id,company_id,user_id,salesperson_id,product_name,customer_name,sale_date,quantity,unit_price,total_price,status,notes,created_at,salesperson,salesperson_info,costs,total_costs",
      )
      .eq("company_id", companyId)
      .order("sale_date", { ascending: false });

    if (!error && data) setSales(data as SaleWithDetails[]);
    setIsLoading(false);
  };

  const handleAdd = () => {
    setEditingSale(null);
    setIsFormOpen(true);
  };

  const handleEdit = (sale: SaleWithDetails) => {
    setEditingSale(sale);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (!error) fetchSales();
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingSale(null);
    fetchSales();
  };

  const handleViewDetails = (sale: SaleWithDetails) => {
    setViewingSale(sale);
  };

  const handleStatusChange = () => {
    fetchSales();
  };

  const completedSales = sales.filter((s) => s.status === "concluída");
  const pendingSales = sales.filter((s) => s.status === "pendente");

  const completedRevenue = completedSales.reduce(
    (sum, s) => sum + Number(s.total_price),
    0,
  );
  const pendingRevenue = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_price),
    0,
  );

  const completedCosts = completedSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0,
  );
  const pendingCosts = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0,
  );

  const completedNetProfit = completedRevenue - completedCosts;
  const pendingNetProfit = pendingRevenue - pendingCosts;

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                  {completedCosts.toLocaleString("pt-BR", {
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
                  {pendingCosts.toLocaleString("pt-BR", {
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
          onClose={() => setViewingSale(null)}
          onChanged={fetchSales}
        />
      )}
    </div>
  );
}
