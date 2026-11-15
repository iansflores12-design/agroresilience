-- Si la base se llena, cargar_supabase.py borra los anos mas viejos de las series y anota aqui desde que
-- fecha quedan datos, para no volver a subir lo recortado.
alter table public.cargas add column if not exists recortado_hasta date;
