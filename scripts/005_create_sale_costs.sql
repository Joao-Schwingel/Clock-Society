-- Create sale_costs table to track additional costs per sale
CREATE TABLE IF NOT EXISTS sale_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  cost_type VARCHAR(100) NOT NULL, -- transporte, tarifas, etc.
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE sale_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own sale costs"
  ON sale_costs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sale costs"
  ON sale_costs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sale costs"
  ON sale_costs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sale costs"
  ON sale_costs FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_sale_costs_sale_id ON sale_costs(sale_id);
CREATE INDEX idx_sale_costs_user_id ON sale_costs(user_id);
