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
import type { Salesperson, SaleWithDetails } from "@/lib/types";
import { DatePickerBR } from "./date-picker-br";

interface SalesFormProps {
  companyId: string;
  userId: string;
  sale: SaleWithDetails | null;
  onSuccess: () => void;
  onCancel: () => void;
}

type SellerInput = {
  salespersonId: string;
  commission: number;
};

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
  unit_price: "0.00",
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
  console.log(sale?.salespersons);
  const [orderNumber, setOrderNumber] = useState(sale?.order_number || "");

  const [items, setItems] = useState<LineItem[]>(() => [newLineItem()]);
  const [totalPrice, setTotalPrice] = useState<number | "">(
    sale?.total_price || "",
  );

  const [saleDate, setSaleDate] = useState(
    sale?.sale_date || new Date().toISOString().split("T")[0],
  );
  const [customerName, setCustomerName] = useState(sale?.customer_name || "");

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
  const [sellers, setSellers] = useState<SellerInput[]>(
    sale?.salespersons?.map((sp) => ({
      salespersonId: sp.id,
      commission: sp.commission_percent,
    })) ?? [
      {
        salespersonId: "",
        commission: 0,
      },
    ],
  );

  function updateSeller(index: number, field: keyof SellerInput, value: any) {
    setSellers((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  function addSeller() {
    setSellers((prev) => [...prev, { salespersonId: "", commission: 0 }]);
  }

  function removeSeller(index: number) {
    setSellers((prev) => prev.filter((_, i) => i !== index));
  }

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
    }
  };

  const loadSaleItems = async () => {
    if (!sale?.id) {
      setItems([newLineItem()]);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("sale_items")
      .select("id,sale_id,product_name,quantity,unit_price")
      .eq("sale_id", sale.id)
      .order("created_at", { ascending: true });

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
        id: it.id,
        product_name: it.product_name,
        quantity: String(it.quantity),
        unit_price: String(it.unit_price),
      })),
    );
  };

  // const itemsTotal = useMemo(() => {
  //   return items.reduce(
  //     (acc, it) => acc + toInt(it.quantity) * toNumber(it.unit_price),
  //     0,
  //   );
  // }, [items]);

  // const totalPrice = useMemo(() => itemsTotal.toFixed(2), [itemsTotal]);

  const parsedEntryValue = useMemo(() => {
    const v = entryValue.trim();
    if (v === "" || v === "0") return 0;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }, [entryValue]);

  const { isCashPayment, effectiveEntryValue, remainingValue } = useMemo(() => {
    const parsedTotal = totalPrice || 0;

    const cash = parsedEntryValue === 0;
    const effectiveEntry = cash ? parsedTotal : parsedEntryValue;

    return {
      isCashPayment: cash,
      effectiveEntryValue: effectiveEntry,
      remainingValue: Math.max(
        0,
        Number(parsedTotal) - Number(effectiveEntry),
      ).toFixed(2),
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

        product_name: first?.product_name ?? "",
        quantity: toInt(first?.quantity ?? "1"),
        unit_price: toNumber(first?.unit_price ?? "0"),

        total_price: totalPrice,

        entry_value:
          entryValue.trim() === "" || entryValue.trim() === "0"
            ? 0
            : effectiveEntryValue,
        payment_status: computedPaymentStatus,
        sale_date: saleDate,
        customer_name: customerName || null,
        status: sale?.status || ("pendente" as const),
        notes: notes || null,
      };
      if (!sale) {
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

        const sellerRows = sellers.map((s) => ({
          sale_id: inserted.id,
          salesperson_id: s.salespersonId,
          commission_percent: s.commission,
        }));

        const { error: sellersErr } = await supabase
          .from("sale_salespersons")
          .insert(sellerRows);

        if (sellersErr) throw sellersErr;

        onSuccess();
        return;
      }

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

      const { error: delSellersErr } = await supabase
        .from("sale_salespersons")
        .delete()
        .eq("sale_id", sale.id);

      if (delSellersErr) throw delSellersErr;

      const sellerRows = sellers.map((s) => ({
        sale_id: sale.id,
        salesperson_id: s.salespersonId,
        commission_percent: s.commission,
      }));

      const { error: insSellersErr } = await supabase
        .from("sale_salespersons")
        .insert(sellerRows);

      if (insSellersErr) throw insSellersErr;

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      {/* p-0 to avoid double padding; scroll happens in inner container */}
      <DialogContent className="sm:max-w-[650px] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{sale ? "Editar Venda" : "Nova Venda"}</DialogTitle>
          <DialogDescription>
            {sale
              ? "Atualize os detalhes da venda"
              : "Adicione uma nova venda ao registro"}
          </DialogDescription>
        </DialogHeader>

        {/* SCROLL CONTAINER */}
        <div className="max-h-[80vh] overflow-y-auto px-6 pb-6">
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
                    <div
                      key={it.id}
                      className="rounded-md border p-3 grid gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                          Item {idx + 1}
                        </div>
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

                        {/* <div className="grid gap-2">
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
                        </div> */}
                      </div>

                      {/* <div className="text-sm text-muted-foreground">
                        Subtotal: R${" "}
                        {(
                          toInt(it.quantity) * toNumber(it.unit_price)
                        ).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </div> */}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="totalPrice">Valor Líquido Total</Label>

                <Input
                  id="totalPrice"
                  type="number"
                  step="0.01"
                  min={0}
                  value={totalPrice}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTotalPrice(v === "" ? "" : Number(v));
                  }}
                  onBlur={() => {
                    if (totalPrice === "") setTotalPrice(0);
                  }}
                  className="text-2xl font-bold"
                />
                {/* <div className="text-2xl font-bold">
                  R${" "}
                  {Number.parseFloat(totalPrice).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </div> */}
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

              <div className="grid gap-4">
                {sellers.map((seller, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="grid gap-2">
                      <Label>Vendedor *</Label>
                      <Select
                        value={seller.salespersonId}
                        onValueChange={(v) =>
                          updateSeller(index, "salespersonId", v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um vendedor" />
                        </SelectTrigger>
                        <SelectContent>
                          {salespersons.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                              {person.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Comissão %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={seller.commission}
                        onChange={(e) =>
                          updateSeller(
                            index,
                            "commission",
                            Number(e.target.value),
                          )
                        }
                      />
                    </div>

                    {sellers.length > 1 && (
                      <Button
                        type="button"
                        variant="destructive"
                        className="bg-red-500"
                        onClick={() => removeSeller(index)}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                ))}

                <Button type="button" variant="outline" onClick={addSeller}>
                  + Adicionar vendedor
                </Button>
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

            {/* sticky footer inside scroll container */}
            <DialogFooter className="sticky bottom-0 bg-background pt-3">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading || salespersons.length === 0}
              >
                {isLoading ? "Salvando..." : sale ? "Atualizar" : "Adicionar"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
