-- Lock down tables to service_role only (edge functions). App auths via CPF (no Supabase Auth users).

-- desbloqueio_logs: keep RLS enabled with no policies => denies anon/authenticated by default
REVOKE ALL ON public.desbloqueio_logs FROM anon, authenticated;
GRANT ALL ON public.desbloqueio_logs TO service_role;

-- device_tokens: remove overly permissive policy that exposed all tokens publicly
DROP POLICY IF EXISTS "Allow all operations on device_tokens" ON public.device_tokens;
REVOKE ALL ON public.device_tokens FROM anon, authenticated;
GRANT ALL ON public.device_tokens TO service_role;