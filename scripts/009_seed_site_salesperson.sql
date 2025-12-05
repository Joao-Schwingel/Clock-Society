-- Function to create "Site" salesperson for each company
CREATE OR REPLACE FUNCTION create_site_salesperson()
RETURNS TRIGGER AS $$
BEGIN
  -- Create a "Site" salesperson for the new company with 0% commission
  INSERT INTO salespersons (user_id, company_id, name, commission_percentage, is_active)
  VALUES (NEW.user_id, NEW.id, 'Site', 0, true);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically add "Site" salesperson when a company is created
DROP TRIGGER IF EXISTS create_site_salesperson_trigger ON companies;
CREATE TRIGGER create_site_salesperson_trigger
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION create_site_salesperson();

-- Add "Site" salesperson to existing companies
INSERT INTO salespersons (user_id, company_id, name, commission_percentage, is_active)
SELECT DISTINCT c.user_id, c.id, 'Site', 0, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM salespersons s 
  WHERE s.company_id = c.id AND s.name = 'Site'
);
