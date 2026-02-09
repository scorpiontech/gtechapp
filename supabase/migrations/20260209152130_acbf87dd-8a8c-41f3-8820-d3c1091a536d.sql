
-- Tabela para registrar uso do autodesbloqueio
CREATE TABLE public.desbloqueio_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índice para busca rápida por cliente e data
CREATE INDEX idx_desbloqueio_logs_cliente_date ON public.desbloqueio_logs (cliente_id, created_at DESC);

-- RLS habilitado mas com política aberta para edge functions (acesso via service role)
ALTER TABLE public.desbloqueio_logs ENABLE ROW LEVEL SECURITY;

-- Nenhuma política pública - acesso somente via service role key nas edge functions
