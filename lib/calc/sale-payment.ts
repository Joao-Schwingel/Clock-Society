// Extraído mecanicamente de components/dashboard/sales-form.tsx:209-239 (spec Fase 1 §5).

export type PaymentStatus = "pendente" | "pago";

export function parseEntryValueInput(entryValue: string): number {
  const v = entryValue.trim();
  if (v === "" || v === "0") return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export type SalePaymentResult = {
  isCashPayment: boolean;
  effectiveEntryValue: number;
  remainingValue: string;
};

// À vista quando a entrada é vazia ou 0; faltante = max(total - entrada efetiva, 0).
export function computeSalePayment(
  totalPrice: number | "",
  entryValue: string,
): SalePaymentResult {
  const parsedEntryValue = parseEntryValueInput(entryValue);
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
}

// Na edição, o status de pagamento existente é mantido (C-SALES-12); em uma
// venda nova, não à vista, o padrão é "pendente".
export function computeAutoPaymentStatus(
  isCashPayment: boolean,
  isEditing: boolean,
  currentPaymentStatus: PaymentStatus,
): PaymentStatus {
  if (isCashPayment) return "pago";
  if (!isEditing) return "pendente";
  return currentPaymentStatus;
}
