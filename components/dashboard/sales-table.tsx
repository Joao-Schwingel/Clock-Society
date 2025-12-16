"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Search, Eye, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Sale, Salesperson, SaleWithDetails } from "@/lib/types";

interface SalesTableProps {
  sales: SaleWithDetails[];
  onEdit: (sale: SaleWithDetails) => void;
  onDelete: (id: string) => void;
  onViewDetails: (sale: SaleWithDetails) => void;
  onStatusChange: () => void;
  isLoading: boolean;
}

export function SalesTable({
  sales,
  onEdit,
  onDelete,
  onViewDetails,
  onStatusChange,
  isLoading,
}: SalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [salespersonsMap, setSalespersonsMap] = useState<
    Record<string, Salesperson>
  >({});

  useEffect(() => {
    loadSalespersons();
  }, [sales]);

  const loadSalespersons = async () => {
    if (sales.length === 0) return;

    const supabase = createClient();
    const salespersonIds = [
      ...new Set(sales.map((s) => s.salesperson_id).filter(Boolean)),
    ];

    if (salespersonIds.length === 0) return;

    const { data } = await supabase
      .from("salespersons")
      .select("*")
      .in("id", salespersonIds);

    if (data) {
      const map: Record<string, Salesperson> = {};
      data.forEach((person) => {
        map[person.id] = person;
      });
      setSalespersonsMap(map);
    }
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const matchesSearch =
        sale.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sale.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDate = !dateFilter || sale.sale_date.startsWith(dateFilter);

      return matchesSearch && matchesDate;
    });
  }, [sales, searchTerm, dateFilter]);

  const handleStatusToggle = async (sale: Sale) => {
    if (sale.status === "concluída") return;

    setUpdatingStatus(sale.id);
    const supabase = createClient();

    try {
      const { data, error } = await supabase
        .from("sales")
        .update({ status: "concluída" })
        .eq("id", sale.id)
        .select();

      if (error) throw error;

      onStatusChange();
    } catch (error) {
      console.error(" Error updating status:", error);
      alert("Erro ao atualizar status da venda");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const getSalespersonName = (salespersonId: string | null | undefined) => {
    if (!salespersonId) return "-";
    const person = salespersonsMap[salespersonId];
    return person ? person.name : "Desconhecido";
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por produto ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          type="month"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-48"
        />
        {(searchTerm || dateFilter) && (
          <Button
            variant="outline"
            onClick={() => {
              setSearchTerm("");
              setDateFilter("");
            }}
          >
            Limpar
          </Button>
        )}
      </div>

      {filteredSales.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {sales.length === 0
            ? "Nenhuma venda registrada ainda."
            : "Nenhum resultado encontrado."}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Preço Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    {new Date(sale.sale_date).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-medium">
                    {sale.product_name}
                  </TableCell>
                  <TableCell>{sale.customer_name || "-"}</TableCell>
                  <TableCell>
                    {getSalespersonName(sale.salesperson_id)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        sale.status === "concluída" ? "default" : "secondary"
                      }
                    >
                      {sale.status === "concluída" ? "Concluída" : "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{sale.quantity}</TableCell>
                  <TableCell className="text-right">
                    R${" "}
                    {Number(sale.unit_price).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    R${" "}
                    {Number(sale.total_price).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {sale.status === "pendente" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusToggle(sale)}
                          disabled={updatingStatus === sale.id}
                          title="Marcar como Concluída"
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onViewDetails(sale)}
                        title="Ver Detalhes"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(sale)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (
                            confirm(
                              "Tem certeza que deseja excluir esta venda?",
                            )
                          ) {
                            onDelete(sale.id);
                          }
                        }}
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
