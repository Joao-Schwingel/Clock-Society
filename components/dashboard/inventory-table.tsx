"use client";

import { useState, useMemo } from "react";
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
import { Pencil, Trash2, Search, Download } from "lucide-react";
import type { InventoryItem } from "@/lib/types";
import { buildInventoryCsvContent } from "@/lib/calc/inventory-csv";
import { toast } from "sonner";
import { formatBR } from "@/lib/utils";

interface InventoryTableProps {
  inventory: InventoryItem[];
  onEdit?: (item: InventoryItem) => void;
  onDelete?: (id: string) => void;
  isLoading: boolean;
  /** Vendedor (Fase 6, 4.6): todas as colunas, inclusive custo, mas sem a coluna de ações. */
  readOnly?: boolean;
}

export function InventoryTable({
  inventory,
  onEdit,
  onDelete,
  isLoading,
  readOnly = false,
}: InventoryTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch = item.product_name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesLocation =
        !locationFilter ||
        item.location?.toLowerCase().includes(locationFilter.toLowerCase());

      return matchesSearch && matchesLocation;
    });
  }, [inventory, searchTerm, locationFilter]);

  const locations = useMemo(() => {
    return Array.from(
      new Set(inventory.map((item) => item.location).filter(Boolean)),
    );
  }, [inventory]);

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Carregando...
      </div>
    );
  }

  // Exporta o que está na tela (os mesmos filtros), como o CSV de vendas. Os dados já estão em
  // memória: a tela do estoque carrega a empresa inteira de uma vez, sem paginação.
  const handleExport = () => {
    if (filteredInventory.length === 0) {
      toast.error("Nenhum dado para exportar", { position: "top-center" });
      return;
    }
    const blob = new Blob([buildInventoryCsvContent(filteredInventory)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `estoque-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredInventory.length} itens exportados`, { position: "top-center" });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Filtrar por localização..."
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="w-64"
        />
        {(searchTerm || locationFilter) && (
          <Button
            variant="outline"
            onClick={() => {
              setSearchTerm("");
              setLocationFilter("");
            }}
          >
            Limpar
          </Button>
        )}

        {!readOnly && (
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        )}
      </div>

      {filteredInventory.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {inventory.length === 0
            ? "Nenhum item no estoque ainda."
            : "Nenhum resultado encontrado."}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Custo Unit.</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead>Última Atualização</TableHead>
                {!readOnly && <TableHead className="text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.product_name}
                  </TableCell>
                  <TableCell>{item.location || "-"}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    R${" "}
                    {Number(item.unit_cost).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    R${" "}
                    {Number(item.total_value).toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell>{formatBR(item.last_updated)}</TableCell>
                  {!readOnly && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit?.(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (
                            confirm("Tem certeza que deseja excluir este item?")
                          ) {
                            onDelete?.(item.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
