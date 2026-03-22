alter table if exists public.access_invitations
  drop constraint if exists access_invitations_role_check;

alter table if exists public.access_invitations
  add constraint access_invitations_role_check
  check (role in ('admin', 'super_admin'));

create or replace function public.create_access_invitation(target_email text, target_full_name text, target_role text)
returns table (
  invitation_id uuid,
  invite_token text,
  email text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text;
  normalized_role text;
  generated_token text;
  created_invitation_id uuid;
  created_expires_at timestamptz;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Solo super admin puede crear invitaciones.';
  end if;

  normalized_email := lower(trim(target_email));
  normalized_role := lower(trim(target_role));

  if normalized_email = '' then
    raise exception 'El correo es obligatorio.';
  end if;

  if normalized_role not in ('admin', 'super_admin') then
    raise exception 'Rol no permitido: %', target_role;
  end if;

  update public.access_invitations as invitations
  set status = 'expired'
  where invitations.status = 'pending' and invitations.expires_at < now();

  if exists (
    select 1
    from public.access_invitations as invitations
    where invitations.email = normalized_email
      and invitations.status = 'pending'
      and invitations.expires_at >= now()
  ) then
    raise exception 'Ya existe una invitación activa para ese correo.';
  end if;

  generated_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.access_invitations (email, full_name, role, invite_token, invited_by)
  values (normalized_email, nullif(trim(target_full_name), ''), normalized_role, generated_token, auth.uid())
  returning access_invitations.id, access_invitations.expires_at
  into created_invitation_id, created_expires_at;

  insert into public.access_role_audit (actor_user_id, target_email, action, next_role, reason, metadata)
  values (
    auth.uid(),
    normalized_email,
    'invite_created',
    normalized_role,
    'Invitacion creada desde panel super admin',
    jsonb_build_object('full_name', nullif(trim(target_full_name), ''), 'invite_token', generated_token)
  );

  return query
  select
    created_invitation_id,
    generated_token,
    normalized_email,
    normalized_role,
    created_expires_at;
end;
$$;

create or replace function public.assign_access_role(target_user_id uuid, next_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_role text;
  current_role text;
  current_email text;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Solo super admin puede cambiar roles.';
  end if;

  normalized_role := lower(trim(next_role));

  if normalized_role not in ('admin', 'super_admin') then
    raise exception 'Rol no permitido: %', next_role;
  end if;

  select public.resolve_user_role(target_user_id), email::text
  into current_role, current_email
  from auth.users
  where id = target_user_id;

  if current_role is null then
    raise exception 'Usuario no encontrado.';
  end if;

  if current_role = 'super_admin' and normalized_role <> 'super_admin' and public.count_super_admins() <= 1 then
    raise exception 'No puedes degradar al ultimo super admin activo.';
  end if;

  update auth.users
  set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', normalized_role),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', normalized_role),
    updated_at = now()
  where id = target_user_id;

  if not found then
    raise exception 'Usuario no encontrado.';
  end if;

  insert into public.access_role_audit (actor_user_id, target_user_id, target_email, action, previous_role, next_role, reason)
  values (
    auth.uid(),
    target_user_id,
    current_email,
    'role_changed',
    current_role,
    normalized_role,
    'Cambio manual desde panel super admin'
  );
end;
$$;