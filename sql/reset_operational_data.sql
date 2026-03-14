-- Reinicia los datos operativos del gimnasio sin tocar Supabase Auth.
-- No elimina usuarios de auth.users ni sesiones de autenticación.

truncate table
  public.pagos,
  public.reservas,
  public.membresias,
  public.programacion_actividades,
  public.entrenadores,
  public.clientes,
  public.persona_telefonos,
  public.actividades,
  public.sedes,
  public.personas
restart identity cascade;

-- Si más adelante quieres reiniciar también el módulo de accesos, descomenta esto.
-- truncate table
--   public.access_role_audit,
--   public.access_invitations
-- restart identity cascade;