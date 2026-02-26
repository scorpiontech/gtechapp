
-- Table to store device push notification tokens
CREATE TABLE public.device_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cliente_id, token)
);

-- Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Public insert/select/delete (app uses CPF auth, not Supabase auth)
CREATE POLICY "Allow all operations on device_tokens"
ON public.device_tokens
FOR ALL
USING (true)
WITH CHECK (true);

-- Index for fast lookup by cliente_id
CREATE INDEX idx_device_tokens_cliente_id ON public.device_tokens(cliente_id);
