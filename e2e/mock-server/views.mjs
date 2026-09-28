// Reconstrói as views sales_with_details / sales_with_salespersons a partir das
// tabelas base, espelhando scripts/views/*.sql (= definição de produção,
// docs/baseline/) — em vez de duplicar os mesmos dados em duas formas no fixture.

function salespersonsForSale(tables, saleId) {
  return tables.sale_salespersons
    .filter((r) => r.sale_id === saleId)
    .map((r) => {
      const sp = tables.salespersons.find((p) => p.id === r.salesperson_id);
      return { id: sp?.id, name: sp?.name, commission_percent: r.commission_percent };
    });
}

function costsForSale(tables, saleId) {
  return tables.sale_costs.filter((c) => c.sale_id === saleId);
}

export function salesWithDetails(tables) {
  return tables.sales.map((s) => {
    const costs = costsForSale(tables, s.id);
    const total_costs = costs.reduce((sum, c) => sum + Number(c.amount), 0);

    return {
      id: s.id,
      company_id: s.company_id,
      user_id: s.user_id,
      order_number: s.order_number,
      product_name: s.product_name,
      customer_name: s.customer_name,
      sale_date: s.sale_date,
      quantity: s.quantity,
      unit_price: s.unit_price,
      total_price: s.total_price,
      entry_value: s.entry_value,
      status: s.status,
      payment_status: s.payment_status,
      notes: s.notes,
      created_at: s.created_at,
      salespersons: salespersonsForSale(tables, s.id),
      costs,
      total_costs,
    };
  });
}

export function salesWithSalespersons(tables) {
  return tables.sales.map((s) => ({
    id: s.id,
    company_id: s.company_id,
    status: s.status,
    sale_date: s.sale_date,
    total_price: s.total_price,
    // Em produção é jsonb_agg(...) FILTER (...): null, e não [], para venda sem vendedor.
    salespersons: salespersonsForSale(tables, s.id).length > 0 ? salespersonsForSale(tables, s.id) : null,
  }));
}

export const VIEW_BUILDERS = {
  sales_with_details: salesWithDetails,
  sales_with_salespersons: salesWithSalespersons,
};
