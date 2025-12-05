-- Create salespersons table
CREATE TABLE IF NOT EXISTS salespersons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE salespersons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own salespersons"
  ON salespersons FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own salespersons"
  ON salespersons FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own salespersons"
  ON salespersons FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own salespersons"
  ON salespersons FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_salespersons_user_id ON salespersons(user_id);
CREATE INDEX idx_salespersons_company_id ON salespersons(company_id);

-- Update sales table to reference salespersons
ALTER TABLE sales ADD COLUMN salesperson_id UUID REFERENCES salespersons(id) ON DELETE SET NULL;
CREATE INDEX idx_sales_salesperson_id ON sales(salesperson_id);
