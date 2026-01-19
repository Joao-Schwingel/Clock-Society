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
import { DashboardFilters } from "./dashboards-filters";

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
  const [months, setMonths] = useState<number[]>([]);
  const [year, setYear] = useState("2026");

  const fetchSales = async () => {
    setIsLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("sales_with_details")
      .select(
        "id,company_id,user_id,salesperson_id,entry_value,payment_status,product_name,customer_name,sale_date,quantity,unit_price,total_price,status,order_number,notes,created_at,salesperson,salesperson_info,costs,total_costs"
      )
      .eq("company_id", companyId)
      .order("sale_date", { ascending: false });

    if (months.length > 0) {
      const ranges = months.map((m) => {
        const start = new Date(Number(year), m, 1);
        const end = new Date(Number(year), m + 1, 1);
        return `and(sale_date.gte.${start.toISOString()},sale_date.lt.${end.toISOString()})`;
      });

      query = query.or(ranges.join(","));
    }

    const { data, error } = await query.order("order_number", {
      ascending: true,
    });

    if (!error && data) setSales(data as SaleWithDetails[]);
    setIsLoading(false);
  };

  const handleAdd = () => {
    setEditingSale(null);
    setIsFormOpen(true);
  };

  const handleEdit = (sale: SaleWithDetails) => {
    console.log(sale)
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
    0
  );
  const pendingRevenue = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_price),
    0
  );

  const completedCosts = completedSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0
  );
  const pendingCosts = pendingSales.reduce(
    (sum, s) => sum + Number(s.total_costs ?? 0),
    0
  );

  const completedNetProfit = completedRevenue - completedCosts;
  const pendingNetProfit = pendingRevenue - pendingCosts;

  // =========================
  // Pagamentos (NOVO)
  // =========================
  const paymentsCompleted = sales.filter((s) => s.payment_status === "pago");
  const paymentsPending = sales.filter((s) => s.payment_status !== "pago");

  const totalEntryValue = sales.reduce(
    (sum, s) => sum + Number(s.entry_value ?? 0),
    0
  );

  // "faltante" = total_price - entry_value (nunca negativo), apenas para pagamentos pendentes
  const totalMissingPayments = paymentsPending.reduce((sum, s) => {
    const total = Number(s.total_price ?? 0);
    const entry = Number(s.entry_value ?? 0);
    return sum + Math.max(total - entry, 0);
  }, 0);

  useEffect(() => {
    fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, months, year]);

  return (
    <div className="space-y-4">
      {/* =========================
          Vendas Concluídas
         ========================= */}
      <div>
        <div className="flex gap-6 items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-green-600">
            Vendas Concluídas
          </h3>
          <DashboardFilters
            value={months}
            yearValue={year}
            onChange={setMonths}
            onYearChange={setYear}
          ></DashboardFilters>
        </div>
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

      {/* =========================
          Vendas Pendentes
         ========================= */}
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

      {/* =========================
          Pagamentos (NOVO)
         ========================= */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-blue-600">Pagamentos</h3>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pagamentos Concluídos
              </CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {paymentsCompleted.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vendas com pagamento confirmado
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pagamentos Pendentes
              </CardTitle>
              <Clock className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {paymentsPending.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  Vendas aguardando pagamento
                </p>
              </CardContent>
            </Spinner>
          </Card>

          <Card className="border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Valor Total Faltante
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <Spinner loading={isLoading} size={"3"}>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  R${" "}
                  {totalMissingPayments.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total a receber (total - entrada)
                </p>
              </CardContent>
            </Spinner>
          </Card>

          {/* <Card className="border-blue-200"> */}
          {/*   <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"> */}
          {/*     <CardTitle className="text-sm font-medium"> */}
          {/*       Valor Total de Entrada */}
          {/*     </CardTitle> */}
          {/*     <Receipt className="h-4 w-4 text-blue-600" /> */}
          {/*   </CardHeader> */}
          {/*   <Spinner loading={isLoading} size={"3"}> */}
          {/*     <CardContent> */}
          {/*       <div className="text-2xl font-bold text-blue-600"> */}
          {/*         R${" "} */}
          {/*         {totalEntryValue.toLocaleString("pt-BR", { */}
          {/*           minimumFractionDigits: 2, */}
          {/*         })} */}
          {/*       </div> */}
          {/*       <p className="text-xs text-muted-foreground"> */}
          {/*         Somatório de entradas */}
          {/*       </p> */}
          {/*     </CardContent> */}
          {/*   </Spinner> */}
          {/* </Card> */}
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
            onPaymentConfirmed={(saleId) => {
              setSales((prev) =>
                prev.map((s) =>
                  s.id === saleId
                    ? ({ ...(s as any), payment_status: "pago" } as any)
                    : s
                )
              );
            }}
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
