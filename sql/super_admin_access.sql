create table if not exists public.access_role_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  target_user_id uuid,
  target_email text,
  action text not null,
  previous_role text,
  next_role text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.access_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text not null,
  invite_token text not null unique,
  status text not null default 'pending',
  invited_by uuid,
  accepted_user_id uuid,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint access_invitations_role_check check (role in ('trainer', 'admin', 'super_admin')),
  constraint access_invitations_status_check check (status in ('pending', 'accepted', 'expired', 'revoked'))
);

create or replace function public.is_super_admin(requester_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select coalesce(
        raw_app_meta_data ->> 'role',
        raw_user_meta_data ->> 'role',
        case when email ilike '%@fithub.superadmin' then 'super_admin' end,
        'trainer'
      ) = 'super_admin'
      from auth.users
      where id = requester_id
    ),
    false
  );
$$;

create or replace function public.resolve_user_role(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select coalesce(
        raw_app_meta_data ->> 'role',
        raw_user_meta_data ->> 'role',
        case when email ilike '%@fithub.superadmin' then 'super_admin' end,
        case when email ilike '%@fithub.admin' then 'admin' end,
        'trainer'
      )
      from auth.users
      where id = target_user_id
    ),
    'trainer'
  );
$$;

create or replace function public.count_super_admins()
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select count(*)::int
  from auth.users
  where coalesce(
    raw_app_meta_data ->> 'role',
    raw_user_meta_data ->> 'role',
    case when email ilike '%@fithub.superadmin' then 'super_admin' end,
    case when email ilike '%@fithub.admin' then 'admin' end,
    'trainer'
  ) = 'super_admin';
$$;

create or replace function public.list_access_profiles()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  persona_id uuid,
  persona_nombre text,
  telefono text,
  profile_type text,
  email_confirmed boolean,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Solo super admin puede listar accesos.';
  end if;

  return query
  select
    u.id as user_id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', p.nombre, split_part(u.email::text, '@', 1)) as full_name,
    coalesce(
      u.raw_app_meta_data ->> 'role',
      u.raw_user_meta_data ->> 'role',
      case when u.email::text ilike '%@fithub.superadmin' then 'super_admin' end,
      case when u.email::text ilike '%@fithub.admin' then 'admin' end,
      'trainer'
    ) as role,
    p.id_persona as persona_id,
    p.nombre as persona_nombre,
    pt.telefono,
    case
      when e.id_persona is not null and c.id_persona is not null then 'cliente_y_entrenador'
      when e.id_persona is not null then 'entrenador'
      when c.id_persona is not null then 'cliente'
      when p.id_persona is not null then 'persona'
      else 'sin_enlace'
    end as profile_type,
    (u.email_confirmed_at is not null) as email_confirmed,
    u.last_sign_in_at
  from auth.users u
  left join public.personas p on lower(p.correo) = lower(u.email::text)
  left join public.persona_telefonos pt on pt.id_persona = p.id_persona
  left join public.entrenadores e on e.id_persona = p.id_persona
  left join public.clientes c on c.id_persona = p.id_persona
  order by coalesce(u.last_sign_in_at, u.created_at) desc nulls last, u.email asc;
end;
$$;

create or replace function public.list_access_audit(limit_count integer default 40)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text,
  previous_role text,
  next_role text,
  reason text,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Solo super admin puede listar auditoría.';
  end if;

  return query
  select
    audit.id,
    audit.actor_user_id,
    actor.email::text as actor_email,
    audit.target_user_id,
    audit.target_email,
    audit.action,
    audit.previous_role,
    audit.next_role,
    audit.reason,
    audit.metadata,
    audit.created_at
  from public.access_role_audit audit
  left join auth.users actor on actor.id = audit.actor_user_id
  order by audit.created_at desc
  limit greatest(limit_count, 1);
end;
$$;

create or replace function public.list_access_invitations()
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  status text,
  invite_token text,
  invited_by uuid,
  invited_by_email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Solo super admin puede listar invitaciones.';
  end if;

  update public.access_invitations as invitations
  set status = 'expired'
  where invitations.status = 'pending' and invitations.expires_at < now();

  return query
  select
    invitations.id,
    invitations.email,
    invitations.full_name,
    invitations.role,
    invitations.status,
    invitations.invite_token,
    invitations.invited_by,
    actor.email::text as invited_by_email,
    invitations.expires_at,
    invitations.accepted_at,
    invitations.created_at
  from public.access_invitations invitations
  left join auth.users actor on actor.id = invitations.invited_by
  order by invitations.created_at desc;
end;
$$;

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

  if normalized_role not in ('trainer', 'admin', 'super_admin') then
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
    'Invitación creada desde panel super admin',
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

create or replace function public.validate_access_invitation(invite_token_input text)
returns table (
  email text,
  full_name text,
  role text,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.access_invitations as invitations
  set status = 'expired'
  where invitations.status = 'pending' and invitations.expires_at < now();

  return query
  select invitations.email, invitations.full_name, invitations.role, invitations.expires_at, invitations.status
  from public.access_invitations invitations
  where invitations.invite_token = trim(invite_token_input)
  limit 1;
end;
$$;

create or replace function public.consume_access_invitation(invite_token_input text, invited_email text, invited_full_name text default null)
returns table (
  role text,
  email text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  invitation_record public.access_invitations%rowtype;
  target_user_id uuid;
begin
  select *
  into invitation_record
  from public.access_invitations
  where invite_token = trim(invite_token_input)
  limit 1;

  if not found then
    raise exception 'Invitación no encontrada.';
  end if;

  if invitation_record.status <> 'pending' then
    raise exception 'La invitación ya no está activa.';
  end if;

  if invitation_record.expires_at < now() then
    update public.access_invitations
    set status = 'expired'
    where id = invitation_record.id;
    raise exception 'La invitación expiró.';
  end if;

  if lower(trim(invited_email)) <> lower(invitation_record.email) then
    raise exception 'El correo no coincide con la invitación.';
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(email::text) = lower(trim(invited_email))
  order by created_at desc
  limit 1;

  if target_user_id is null then
    raise exception 'Primero debes completar el registro del usuario invitado.';
  end if;

  update auth.users
  set
    raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', invitation_record.role),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', invitation_record.role)
      || case when coalesce(nullif(trim(invited_full_name), ''), invitation_record.full_name) is null then '{}'::jsonb else jsonb_build_object('full_name', coalesce(nullif(trim(invited_full_name), ''), invitation_record.full_name)) end,
    updated_at = now()
  where id = target_user_id;

  update public.access_invitations
  set
    status = 'accepted',
    accepted_at = now(),
    accepted_user_id = target_user_id
  where id = invitation_record.id;

  insert into public.access_role_audit (actor_user_id, target_user_id, target_email, action, next_role, reason, metadata)
  values (
    target_user_id,
    target_user_id,
    invitation_record.email,
    'invite_accepted',
    invitation_record.role,
    'Invitación aceptada durante registro',
    jsonb_build_object('invitation_id', invitation_record.id)
  );

  return query
  select invitation_record.role, invitation_record.email;
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

  if normalized_role not in ('trainer', 'admin', 'super_admin') then
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
    raise exception 'No puedes degradar al último super admin activo.';
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

grant execute on function public.resolve_user_role(uuid) to authenticated;
grant execute on function public.count_super_admins() to authenticated;
grant execute on function public.is_super_admin(uuid) to authenticated;
grant execute on function public.list_access_profiles() to authenticated;
grant execute on function public.list_access_audit(integer) to authenticated;
grant execute on function public.list_access_invitations() to authenticated;
grant execute on function public.create_access_invitation(text, text, text) to authenticated;
grant execute on function public.validate_access_invitation(text) to anon, authenticated;
grant execute on function public.consume_access_invitation(text, text, text) to anon, authenticated;
grant execute on function public.assign_access_role(uuid, text) to authenticated;