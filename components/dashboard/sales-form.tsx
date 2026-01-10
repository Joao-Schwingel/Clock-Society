"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { Sale, Salesperson } from "@/lib/types";
import { DatePickerBR } from "./date-picker-br";

interface SalesFormProps {
  companyId: string;
  userId: string;
  sale: Sale | null;
  onSuccess: () => void;
  onCancel: () => void;
}

type PaymentStatus = "pendente" | "pago";

type LineItem = {
  id: string; // ui id
  product_name: string;
  quantity: string;
  unit_price: string;
};

const newLineItem = (): LineItem => ({
  id: crypto.randomUUID(),
  product_name: "",
  quantity: "1",
  unit_price: "",
});

const toNumber = (v: string) => {
  const n = Number.parseFloat(v || "0");
  return Number.isFinite(n) ? n : 0;
};

const toInt = (v: string) => {
  const n = Number.parseInt(v || "0", 10);
  return Number.isFinite(n) ? n : 0;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price?: number; // generated in db
  created_at?: string;
};

export function SalesForm({
  companyId,
  userId,
  sale,
  onSuccess,
  onCancel,
}: SalesFormProps) {
  const [orderNumber, setOrderNumber] = useState(sale?.order_number || "");

  const [items, setItems] = useState<LineItem[]>(() => [newLineItem()]);

  const [saleDate, setSaleDate] = useState(
    sale?.sale_date || new Date().toISOString().split("T")[0],
  );
  const [customerName, setCustomerName] = useState(sale?.customer_name || "");
  const [salespersonId, setSalespersonId] = useState(
    sale?.salesperson_id || "",
  );
  const [notes, setNotes] = useState(sale?.notes || "");

  const [entryValue, setEntryValue] = useState(() => {
    const v = sale?.entry_value;
    return v === null || v === undefined ? "" : String(v);
  });

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(() => {
    const ps = (sale as any)?.payment_status as PaymentStatus | undefined;
    return ps ?? "pendente";
  });

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);

  useEffect(() => {
    void loadSalespersons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, userId]);

  useEffect(() => {
    void loadSaleItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id]);

  const loadSalespersons = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("salespersons")
      .select("*")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name");

    if (error) return;

    if (data) {
      setSalespersons(data);
      if (data.length > 0 && !salespersonId) setSalespersonId(data[0].id);
    }
  };

  const loadSaleItems = async () => {
    if (!sale?.id) {
      // compat: novo sale
      setItems([newLineItem()]);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("sale_items")
      .select("id,sale_id,product_name,quantity,unit_price")
      .eq("sale_id", sale.id)
      .order("created_at", { ascending: true });

    // fallback: se ainda não existe itens (venda legacy), cria 1 item pela sale
    if (error || !data || data.length === 0) {
      setItems([
        {
          id: crypto.randomUUID(),
          product_name: sale.product_name ?? "",
          quantity: sale.quantity?.toString() ?? "1",
          unit_price: sale.unit_price?.toString() ?? "",
        },
      ]);
      return;
    }

    setItems(
      data.map((it: SaleItemRow) => ({
        id: it.id, // mantém id real do db (útil pro update)
        product_name: it.product_name,
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
      })),
    );
  };

  const itemsTotal = useMemo(() => {
    return items.reduce(
      (acc, it) => acc + toInt(it.quantity) * toNumber(it.unit_price),
      0,
    );
  }, [items]);

  const totalPrice = useMemo(() => itemsTotal.toFixed(2), [itemsTotal]);

  const parsedEntryValue = useMemo(() => {
    const v = entryValue.trim();
    if (v === "") return 0;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }, [entryValue]);

  const { isCashPayment, effectiveEntryValue, remainingValue } = useMemo(() => {
    const parsedTotal = Number.parseFloat(totalPrice) || 0;

    const cash = parsedEntryValue === 0;
    const effectiveEntry = cash ? parsedTotal : parsedEntryValue;

    return {
      isCashPayment: cash,
      effectiveEntryValue: effectiveEntry,
      remainingValue: Math.max(0, parsedTotal - effectiveEntry).toFixed(2),
    };
  }, [parsedEntryValue, totalPrice]);

  useEffect(() => {
    if (isCashPayment) {
      if (paymentStatus !== "pago") setPaymentStatus("pago");
    } else {
      if (!sale && paymentStatus !== "pendente") setPaymentStatus("pendente");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCashPayment]);

  const normalizeOrderNumber = (value: string) => value.trim();

  const orderNumberExists = async (
    supabase: ReturnType<typeof createClient>,
  ) => {
    const normalized = normalizeOrderNumber(orderNumber);
    if (!normalized) return false;

    let query = supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("order_number", normalized);

    if (sale?.id) query = query.neq("id", sale.id);

    const { count, error } = await query;
    if (error) throw error;

    return (count ?? 0) > 0;
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  };

  const addItem = () => setItems((prev) => [...prev, newLineItem()]);

  const removeItem = (id: string) => {
    setItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((it) => it.id !== id),
    );
  };

  const toSaleItemInsertRows = (saleId: string) =>
    items.map((it) => ({
      sale_id: saleId,
      product_name: it.product_name.trim(),
      quantity: toInt(it.quantity),
      unit_price: toNumber(it.unit_price),
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      const exists = await orderNumberExists(supabase);
      if (exists) {
        setError("Já existe uma venda com este número de pedido.");
        return;
      }

      const computedPaymentStatus: PaymentStatus = isCashPayment
        ? "pago"
        : paymentStatus;

      const first = items[0];

      const saleHeader = {
        company_id: companyId,
        user_id: userId,
        order_number: normalizeOrderNumber(orderNumber),

        // compat (se ainda existe no schema)
        product_name: first?.product_name ?? "",
        quantity: toInt(first?.quantity ?? "1"),
        unit_price: toNumber(first?.unit_price ?? "0"),

        // total é soma dos itens (trigger pode recalcular depois também)
        total_price: Number.parseFloat(totalPrice),

        entry_value: entryValue.trim() === "" ? 0 : effectiveEntryValue,
        payment_status: computedPaymentStatus,
        sale_date: saleDate,
        customer_name: customerName || null,
        salesperson_id: salespersonId ? salespersonId : null,
        status: sale?.status || ("pendente" as const),
        notes: notes || null,
      };

      if (!sale) {
        // CREATE: cria header e depois itens
        const { data: inserted, error: insErr } = await supabase
          .from("sales")
          .insert([saleHeader])
          .select("id")
          .single();

        if (insErr) throw insErr;
        if (!inserted?.id)
          throw new Error("Falha ao criar venda (id ausente).");

        const rows = toSaleItemInsertRows(inserted.id);

        const { error: itemsErr } = await supabase
          .from("sale_items")
          .insert(rows);
        if (itemsErr) throw itemsErr;

        onSuccess();
        return;
      }

      // UPDATE: atualiza header, depois substitui itens (delete + insert)
      const { error: upErr } = await supabase
        .from("sales")
        .update(saleHeader)
        .eq("id", sale.id);
      if (upErr) throw upErr;

      const { error: delErr } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", sale.id);
      if (delErr) throw delErr;

      const rows = toSaleItemInsertRows(sale.id);
      const { error: itemsErr } = await supabase
        .from("sale_items")
        .insert(rows);
      if (itemsErr) throw itemsErr;

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>{sale ? "Editar Venda" : "Nova Venda"}</DialogTitle>
          <DialogDescription>
            {sale
              ? "Atualize os detalhes da venda"
              : "Adicione uma nova venda ao registro"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="orderNumber">Número do Pedido *</Label>
              <Input
                id="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Produtos *</Label>
                <Button type="button" variant="outline" onClick={addItem}>
                  + Adicionar produto
                </Button>
              </div>

              <div className="grid gap-3">
                {items.map((it, idx) => (
                  <div key={it.id} className="rounded-md border p-3 grid gap-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Item {idx + 1}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeItem(it.id)}
                        disabled={items.length <= 1}
                      >
                        Remover
                      </Button>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor={`productName-${it.id}`}>
                        Nome do Produto *
                      </Label>
                      <Input
                        id={`productName-${it.id}`}
                        value={it.product_name}
                        onChange={(e) =>
                          updateItem(it.id, { product_name: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor={`quantity-${it.id}`}>
                          Quantidade *
                        </Label>
                        <Input
                          id={`quantity-${it.id}`}
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) =>
                            updateItem(it.id, { quantity: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor={`unitPrice-${it.id}`}>
                          Valor Líquido (R$) *
                        </Label>
                        <Input
                          id={`unitPrice-${it.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={it.unit_price}
                          onChange={(e) =>
                            updateItem(it.id, { unit_price: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      Subtotal: R${" "}
                      {(
                        toInt(it.quantity) * toNumber(it.unit_price)
                      ).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Preço Total</Label>
              <div className="text-2xl font-bold">
                R${" "}
                {Number.parseFloat(totalPrice).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="grid gap-2">
                <Label htmlFor="entryValue">Valor de Entrada (R$)</Label>
                <Input
                  id="entryValue"
                  type="number"
                  step="0.01"
                  min="0"
                  value={entryValue}
                  onChange={(e) => setEntryValue(e.target.value)}
                />
                <div className="min-h-[20px]">
                  {isCashPayment && (
                    <span className="text-sm text-muted-foreground">
                      Pagamento à vista
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Valor Faltante</Label>
                <div className="text-2xl font-bold">
                  R${" "}
                  {Number.parseFloat(remainingValue).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="saleDate">Data da Venda *</Label>
              <DatePickerBR
                id="saleDate"
                value={saleDate}
                onChange={setSaleDate}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="customerName">Nome do Cliente</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="salesperson">Vendedor *</Label>
              <Select value={salespersonId} onValueChange={setSalespersonId}>
                <SelectTrigger id="salesperson">
                  <SelectValue placeholder="Selecione um vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {salespersons.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name} ({person.commission_percentage}% comissão)
                    </SelectItem>
                  ))}
                  {salespersons.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Nenhum vendedor ativo. Configure vendedores primeiro.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading || salespersons.length === 0 || !salespersonId
              }
            >
              {isLoading ? "Salvando..." : sale ? "Atualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
