ALTER TABLE fixed_costs
ADD COLUMN end_date DATE;

UPDATE fixed_costs
SET end_date = start_date + (qtdmonths || ' months')::INTERVAL;

CREATE OR REPLACE FUNCTION fixed_costs_set_end_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.end_date :=
    NEW.start_date + (NEW.qtdmonths || ' months')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fixedcosts_set_end_date
BEFORE INSERT OR UPDATE OF start_date, qtdmonths
ON fixed_costs
FOR EACH ROW
EXECUTE FUNCTION fixed_costs_set_end_date();
