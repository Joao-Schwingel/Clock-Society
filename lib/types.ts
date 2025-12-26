export interface Company {
  id: string;
  name: string;
  code: string;
  user_id: string;
  created_at: string;
}

export interface Salesperson {
  id: string;
  user_id: string;
  company_id: string;
  name: string;
  commission_percentage: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  company_id: string;
  product_name: string;
  order_number: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sale_date: string;
  entry_value: number;
  customer_name: string | null;
  salesperson: "A" | "B" | "C";
  salesperson_id?: string | null;
  status: "pendente" | "concluída";
  payment_status: "pendente" | "pago";
  notes: string | null;
  user_id: string;
  created_at: string;
}

export interface SaleCost {
  id: string;
  sale_id: string;
  cost_type: string;
  description: string | null;
  amount: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  company_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total_value: number;
  location: string | null;
  last_updated: string;
  notes: string | null;
  user_id: string;
  created_at: string;
}

export interface Cost {
  id: string;
  company_id: string;
  category: string;
  description: string;
  amount: number;
  cost_date: string;
  payment_method: string | null;
  notes: string | null;
  user_id: string;
  created_at: string;
}

export interface CommissionData {
  salesperson: string;
  salespersonId: string;
  totalSales: number;
  commission: number;
  salesCount: number;
}

export interface Contract {
  id: string;
  user_id: string;
  name: string;
  monthly_value: number;
  start_date: string;
  discount: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface FixedCost {
  id: string;
  company_id: string;
  user_id: string;
  name: string;
  category: string;
  monthly_value: number;
  qtdmonths: number;
  start_date: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export type SaleWithDetails = Sale & {
  costs: SaleCost[];
  total_costs: number;
  salesperson_info: { id: string; name: string } | null;
};
