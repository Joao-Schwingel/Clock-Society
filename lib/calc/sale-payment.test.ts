import { describe, expect, it } from "vitest";
import { computeAutoPaymentStatus, computeSalePayment } from "./sale-payment";

// C-SALES-12
describe("computeSalePayment", () => {
  it("entrada vazia é pagamento à vista (entrada efetiva = total)", () => {
    const r = computeSalePayment(1000, "");
    expect(r.isCashPayment).toBe(true);
    expect(r.effectiveEntryValue).toBe(1000);
    expect(r.remainingValue).toBe("0.00");
  });

  it('entrada "0" é pagamento à vista', () => {
    const r = computeSalePayment(500, "0");
    expect(r.isCashPayment).toBe(true);
    expect(r.effectiveEntryValue).toBe(500);
  });

  it("entrada parcial não é à vista; faltante = total - entrada", () => {
    const r = computeSalePayment(1000, "300");
    expect(r.isCashPayment).toBe(false);
    expect(r.effectiveEntryValue).toBe(300);
    expect(r.remainingValue).toBe("700.00");
  });

  it("faltante nunca é negativo mesmo com entrada maior que o total", () => {
    const r = computeSalePayment(100, "150");
    expect(r.remainingValue).toBe("0.00");
  });

  it("total vazio ('') é tratado como 0", () => {
    const r = computeSalePayment("", "");
    expect(r.effectiveEntryValue).toBe(0);
    expect(r.remainingValue).toBe("0.00");
  });
});

describe("computeAutoPaymentStatus", () => {
  it("à vista sempre vira pago", () => {
    expect(computeAutoPaymentStatus(true, false, "pendente")).toBe("pago");
    expect(computeAutoPaymentStatus(true, true, "pendente")).toBe("pago");
  });

  it("venda nova, não à vista, é pendente", () => {
    expect(computeAutoPaymentStatus(false, false, "pago")).toBe("pendente");
  });

  it("na edição, o status de pagamento existente é mantido", () => {
    expect(computeAutoPaymentStatus(false, true, "pago")).toBe("pago");
    expect(computeAutoPaymentStatus(false, true, "pendente")).toBe("pendente");
  });
});
