-- Hardening complementar para funcoes publicas no Supabase.
--
-- Contexto:
-- - public.leads fica fechado para anon/authenticated e recebe inserts apenas pela API.
-- - Funcoes SECURITY DEFINER em schemas expostos nao devem ser invocaveis pela API publica.
--
-- Aplique este arquivo depois de leads-schema.sql quando os advisors do Supabase
-- apontarem funcoes internas em public com EXECUTE para anon/authenticated/public.

revoke execute on function public.notify_new_lead() from anon, authenticated, public;
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

alter function public.notify_new_lead()
  set search_path = pg_catalog, public;

alter default privileges in schema public
  revoke execute on functions from anon, authenticated, public;
