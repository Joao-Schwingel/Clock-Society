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

export function SalesForm({
  companyId,
  userId,
  sale,
  onSuccess,
  onCancel,
}: SalesFormProps) {
  const [orderNumber, setOrderNumber] = useState(sale?.order_number || "");
  const [productName, setProductName] = useState(sale?.product_name || "");
  const [quantity, setQuantity] = useState(sale?.quantity?.toString() || "");
  const [unitPrice, setUnitPrice] = useState(
    sale?.unit_price?.toString() || "",
  );
  const [saleDate, setSaleDate] = useState(
    sale?.sale_date || new Date().toISOString().split("T")[0],
  );
  const [customerName, setCustomerName] = useState(sale?.customer_name || "");
  const [salespersonId, setSalespersonId] = useState(
    sale?.salesperson_id || "",
  );
  const [notes, setNotes] = useState(sale?.notes || "");

  // vazio => "" (UI), submit => 0 (DB)
  const [entryValue, setEntryValue] = useState(() => {
    const v = sale?.entry_value;
    return v === null || v === undefined ? "" : String(v);
  });

  // status de pagamento (coluna payment_status)
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

      // garante default para UUID (evita "" no submit)
      if (data.length > 0 && !salespersonId) {
        setSalespersonId(data[0].id);
      }
    }
  };

  const totalPrice = useMemo(() => {
    const q = Number.parseFloat(quantity || "0");
    const u = Number.parseFloat(unitPrice || "0");
    return (q * u).toFixed(2);
  }, [quantity, unitPrice]);

  const parsedEntryValue = useMemo(() => {
    const v = entryValue.trim();
    if (v === "") return 0;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }, [entryValue]);

  // Regra: entrada 0 => à vista => entrada efetiva = total
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

  // define payment_status automaticamente baseado em "à vista" ou não
  useEffect(() => {
    if (isCashPayment) {
      if (paymentStatus !== "pago") setPaymentStatus("pago");
    } else {
      // para venda nova, default pendente; ao editar, respeita o valor do banco
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

    // ao editar, ignora o próprio registro
    if (sale?.id) query = query.neq("id", sale.id);

    const { count, error } = await query;
    if (error) throw error;

    return (count ?? 0) > 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const supabase = createClient();

    try {
      // valida duplicidade do número do pedido
      const exists = await orderNumberExists(supabase);
      if (exists) {
        setError("Já existe uma venda com este número de pedido.");
        return;
      }

      const computedPaymentStatus: PaymentStatus = isCashPayment
        ? "pago"
        : paymentStatus;

      const saleData = {
        company_id: companyId,
        user_id: userId,
        order_number: normalizeOrderNumber(orderNumber),
        product_name: productName,
        quantity: Number.parseInt(quantity, 10),
        unit_price: Number.parseFloat(unitPrice),
        total_price: Number.parseFloat(totalPrice),

        // se usuário não inserir nada => salva 0
        entry_value: entryValue.trim() === "" ? 0 : effectiveEntryValue,

        payment_status: computedPaymentStatus,
        sale_date: saleDate,
        customer_name: customerName || null,

        // FIX UUID: nunca envia "" para uuid
        salesperson_id: salespersonId ? salespersonId : null,

        status: sale?.status || ("pendente" as const),
        notes: notes || null,
      };

      if (sale) {
        const { error } = await supabase
          .from("sales")
          .update(saleData)
          .eq("id", sale.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sales").insert([saleData]);
        if (error) throw error;
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocorreu um erro");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
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
              <Label htmlFor="productName">Nome do Produto *</Label>
              <Input
                id="productName"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantidade *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="unitPrice">Preço Líquido (R$) *</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  required
                />
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
