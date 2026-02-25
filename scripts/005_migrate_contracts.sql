-- Migração: remove coluna discount e adiciona end_date em contracts
-- Os 2 contratos existentes ficam com end_date = NULL (ativos indefinidamente)

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS end_date DATE;

ALTER TABLE contracts
  DROP COLUMN IF EXISTS discount;

-- Índice para filtragem de contratos ativos
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
