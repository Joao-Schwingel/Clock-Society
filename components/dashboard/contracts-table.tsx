"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Contract } from "@/lib/types";
import { formatBR } from "@/lib/utils";

interface ContractsTableProps {
  contracts: Contract[];
  onUpdate: () => void;
  loading: boolean;
}

export function ContractsTable({
  contracts,
  onUpdate,
  loading,
}: ContractsTableProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este contrato?")) return;

    const supabase = createClient();
    const { error } = await supabase.from("contracts").delete().eq("id", id);

    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível excluir o contrato.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Sucesso",
        description: "Contrato excluído com sucesso!",
      });
      onUpdate();
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setDateFilter("");
  };

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch =
      contract.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contract.description &&
        contract.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDate =
      !dateFilter || contract.start_date.startsWith(dateFilter);
    return matchesSearch && matchesDate;
  });

  const totalValue = filteredContracts.reduce(
    (sum, contract) => sum + contract.monthly_value,
    0,
  );
  const totalDiscount = filteredContracts.reduce(
    (sum, contract) => sum + (contract.discount || 0),
    0,
  );
  const netTotal = totalValue - totalDiscount;

  if (loading) {
    return <div className="text-center py-8">Carregando contratos...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <Input
          type="month"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="sm:w-48"
        />
        {(searchTerm || dateFilter) && (
          <Button variant="outline" size="icon" onClick={clearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor Mensal</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Valor Final</TableHead>
              <TableHead>Data Início</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredContracts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  Nenhum contrato encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredContracts.map((contract) => {
                const finalValue =
                  contract.monthly_value - (contract.discount || 0);
                return (
                  <TableRow key={contract.id}>
                    <TableCell className="font-medium">
                      {contract.name}
                    </TableCell>
                    <TableCell>
                      R$ {contract.monthly_value.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-green-600">
                      {contract.discount > 0
                        ? `R$ ${contract.discount.toFixed(2)}`
                        : "-"}
                    </TableCell>
                    <TableCell className="font-semibold">
                      R$ {finalValue.toFixed(2)}
                    </TableCell>
                    <TableCell>{formatBR(contract.start_date)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {contract.description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(contract.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      {filteredContracts.length > 0 && (
        <div className="flex justify-end gap-4 text-sm border-t pt-4">
          <div>
            <span className="text-muted-foreground">Total Bruto:</span>
            <span className="ml-2 font-semibold">
              R$ {totalValue.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Descontos:</span>
            <span className="ml-2 font-semibold text-green-600">
              R$ {totalDiscount.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Total Líquido:</span>
            <span className="ml-2 font-semibold">R$ {netTotal.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
