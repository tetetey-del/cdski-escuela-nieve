-- =====================================================================
-- CDSKI · 007 · Ajustes sugeridos por el linter de seguridad de Supabase
-- =====================================================================

-- search_path fijo en las funciones simples
alter function public.etiqueta_cupo(int) set search_path = public;
alter function public.hoy_chile() set search_path = public;
alter function public.ahora_chile() set search_path = public;

-- Funciones internas: solo las usan otras funciones de la base
revoke execute on function public.calcular_montos(bigint, date, jsonb) from authenticated;
revoke execute on function public.validar_personas(bigint, nivel_esqui, jsonb) from authenticated;
revoke execute on function public.solo_staff() from authenticated;
