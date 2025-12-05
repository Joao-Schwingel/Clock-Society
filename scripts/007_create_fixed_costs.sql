-- Create fixed_costs table for company-specific recurring costs
CREATE TABLE IF NOT EXISTS fixed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  monthly_value DECIMAL(10, 2) NOT NULL,
  start_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_fixed_costs_company ON fixed_costs(company_id);
CREATE INDEX IF NOT EXISTS idx_fixed_costs_user ON fixed_costs(user_id);

-- Enable RLS
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own fixed costs"
  ON fixed_costs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fixed costs"
  ON fixed_costs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fixed costs"
  ON fixed_costs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fixed costs"
  ON fixed_costs FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_fixed_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_fixed_costs_updated_at
  BEFORE UPDATE ON fixed_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_fixed_costs_updated_at();
