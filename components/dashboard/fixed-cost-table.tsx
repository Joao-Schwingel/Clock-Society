"use client";

import { useState } from "react";
import type { FixedCost } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBR } from "@/lib/utils";

interface FixedCostTableProps {
  fixedCosts: FixedCost[];
  onDelete: (id: string) => void;
  isLoading: boolean;
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
];

export function FixedCostTable({
  fixedCosts,
  onDelete,
  isLoading,
}: FixedCostTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [saleType, setSaleType] = useState("ambos");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");

  const filteredCosts = fixedCosts
    .filter((cost) => {
      const matchesSearch =
        cost.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cost.category?.toLowerCase().includes(searchTerm.toLowerCase()) ??
          false);

      const matchesCategory =
        categoryFilter === "all" || cost.category === categoryFilter;

      const matchesDate = (() => {
        if (!dateFilter) return true;

        const start = new Date(cost.start_date);
        const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);

        const endMonth = new Date(
          startMonth.getFullYear(),
          startMonth.getMonth() + cost.qtdmonths,
          1,
        );

        const [year, month] = dateFilter.split("-").map(Number);
        const filterMonth = new Date(year, month - 1, 1);

        return filterMonth >= startMonth && filterMonth < endMonth;
      })();

      const matchesType =
        saleType === "ambos" || cost.category.toLowerCase() === saleType;

      return matchesSearch && matchesCategory && matchesDate && matchesType;
    })
    .sort((a, b) => {
      const valueA = new Date(a.start_date).getTime();
      const valueB = new Date(b.start_date).getTime();

      if (valueA < valueB) return sortDirection === "asc" ? -1 : 1;
      if (valueA > valueB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter("all");
    setDateFilter("");
  };

  const hasActiveFilters = searchTerm || categoryFilter !== "all" || dateFilter;

  const totalFiltered = filteredCosts.reduce(
    (sum, cost) => sum + Number(cost.monthly_value),
    0,
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Custos Fixos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custos Fixos</CardTitle>
        <CardDescription>Lista de todos os custos cadastrados</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="search">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Buscar por nome ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="month"
                value={dateFilter}
                className="w-max"
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Tipo de custo</Label>
              <Select
                defaultValue="ambos"
                onValueChange={(v) => setSaleType(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um tipo de custos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="ambos">Ambos</SelectItem>
                    <SelectItem value="fixo">Fixo</SelectItem>
                    <SelectItem value="variável">Variavel</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Ordem</Label>
              <Select
                defaultValue="desc"
                onValueChange={(v :"asc"|"desc") => setSortDirection(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um tipo de custos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="asc">Crescente</SelectItem>
                    <SelectItem value="desc">Decrescente</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={clearFilters}
                className="gap-2 bg-transparent"
              >
                <X className="h-4 w-4" />
                Limpar Filtros
              </Button>
            )}
          </div>

          {filteredCosts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {hasActiveFilters
                ? "Nenhum custo fixo encontrado com os filtros aplicados."
                : "Nenhum custo fixo cadastrado ainda."}
            </p>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Nº Meses</TableHead>
                      <TableHead>Valor Mensal</TableHead>
                      <TableHead>Data Início</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCosts.map((cost) => (
                      <TableRow key={cost.id}>
                        <TableCell className="font-medium">
                          {cost.name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{cost.category}</Badge>
                        </TableCell>
                        <TableCell>{cost.qtdmonths}</TableCell>
                        <TableCell>
                          R${" "}
                          {Number(cost.monthly_value).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell>{formatBR(cost.start_date)}</TableCell>
                        <TableCell
                          className="max-w-xs truncate"
                          title={cost.description || "-"}
                        >
                          {cost.description || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (
                                confirm(
                                  "Tem certeza que deseja excluir este custo?",
                                )
                              ) {
                                onDelete(cost.id);
                              }
                            }}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Mostrando {filteredCosts.length} de {fixedCosts.length} custos
                  fixos
                </p>
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    R${" "}
                    {totalFiltered.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
