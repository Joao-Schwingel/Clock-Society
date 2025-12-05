-- Adiciona coluna de status nas vendas
ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente';

-- Atualiza vendas existentes para status pendente
UPDATE sales SET status = 'pendente' WHERE status IS NULL;

-- Adiciona check constraint para permitir apenas valores válidos
ALTER TABLE sales ADD CONSTRAINT sales_status_check 
  CHECK (status IN ('pendente', 'concluída'));
