-- Phase 9 — Transactional Infrastructure reference schema
-- PostgreSQL 15+ / Supabase-compatible PostgREST RPC surface.
-- Run with a privileged migration role. Do not expose table writes directly
-- to untrusted clients; the application uses server-side RPC calls only.

create table if not exists public.fse_state_documents (
  key text primary key,
  revision bigint not null check (revision > 0),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create sequence if not exists public.fse_fencing_token_seq;

create table if not exists public.fse_leases (
  name text primary key,
  owner_id text not null,
  fencing_token bigint not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fse_jobs (
  id text primary key,
  queue text not null,
  kind text not null,
  payload jsonb not null,
  status text not null check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  available_at timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null check (max_attempts > 0),
  lease_owner text,
  fencing_token bigint,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text
);
create index if not exists fse_jobs_claim_idx
  on public.fse_jobs(queue, status, available_at, lease_expires_at, created_at);

create table if not exists public.fse_telemetry (
  id text primary key,
  at timestamptz not null,
  instance_id text not null,
  category text not null,
  name text not null,
  level text not null check (level in ('INFO','WARN','ERROR')),
  duration_ms bigint,
  attributes jsonb not null default '{}'::jsonb
);
create index if not exists fse_telemetry_at_idx
  on public.fse_telemetry(at desc);

create or replace function public.fse_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'message', 'PostgreSQL transactional backend is reachable.'
  );
$$;

create or replace function public.fse_state_read(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when d.key is null then null
    else jsonb_build_object(
      'key', d.key,
      'revision', d.revision,
      'value', d.value,
      'updatedAt', floor(extract(epoch from d.updated_at) * 1000)::bigint
    )
  end
  from (select p_key as requested_key) q
  left join public.fse_state_documents d on d.key = q.requested_key;
$$;

create or replace function public.fse_state_list(
  p_prefix text,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', s.key,
        'revision', s.revision,
        'value', s.value,
        'updatedAt', floor(extract(epoch from s.updated_at) * 1000)::bigint
      )
      order by s.updated_at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.fse_state_documents
    where key like p_prefix || '%'
    order by updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) s;
$$;

create or replace function public.fse_state_cas(
  p_key text,
  p_expected_revision bigint,
  p_value jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.fse_state_documents%rowtype;
  v_revision bigint;
begin
  select * into v_current
  from public.fse_state_documents
  where key = p_key
  for update;

  if not found then
    if p_expected_revision is not null then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'currentRevision', null
      );
    end if;

    insert into public.fse_state_documents(key, revision, value, updated_at)
    values (p_key, 1, p_value, now())
    returning revision into v_revision;
  else
    if p_expected_revision is null or v_current.revision <> p_expected_revision then
      return jsonb_build_object(
        'ok', false,
        'conflict', true,
        'currentRevision', v_current.revision
      );
    end if;

    update public.fse_state_documents
    set revision = revision + 1,
        value = p_value,
        updated_at = now()
    where key = p_key
    returning revision into v_revision;
  end if;

  return jsonb_build_object(
    'ok', true,
    'document', jsonb_build_object(
      'key', p_key,
      'revision', v_revision,
      'value', p_value,
      'updatedAt', floor(extract(epoch from now()) * 1000)::bigint
    )
  );
end;
$$;

create or replace function public.fse_lease_acquire(
  p_name text,
  p_owner_id text,
  p_ttl_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.fse_leases%rowtype;
  v_token bigint;
  v_expires timestamptz;
begin
  select * into v
  from public.fse_leases
  where name = p_name
  for update;

  if found and v.expires_at > now() and v.owner_id <> p_owner_id then
    return null;
  end if;

  v_token := nextval('public.fse_fencing_token_seq');
  v_expires := now() + make_interval(secs => greatest(p_ttl_ms, 1)::double precision / 1000.0);

  insert into public.fse_leases(name, owner_id, fencing_token, expires_at, updated_at)
  values (p_name, p_owner_id, v_token, v_expires, now())
  on conflict (name) do update
    set owner_id = excluded.owner_id,
        fencing_token = excluded.fencing_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at;

  return jsonb_build_object(
    'name', p_name,
    'ownerId', p_owner_id,
    'fencingToken', v_token,
    'expiresAt', floor(extract(epoch from v_expires) * 1000)::bigint
  );
end;
$$;

create or replace function public.fse_lease_renew(
  p_name text,
  p_owner_id text,
  p_fencing_token bigint,
  p_ttl_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expires timestamptz;
begin
  v_expires := now() + make_interval(secs => greatest(p_ttl_ms, 1)::double precision / 1000.0);

  update public.fse_leases
  set expires_at = v_expires,
      updated_at = now()
  where name = p_name
    and owner_id = p_owner_id
    and fencing_token = p_fencing_token
    and expires_at > now();

  if not found then return null; end if;

  return jsonb_build_object(
    'name', p_name,
    'ownerId', p_owner_id,
    'fencingToken', p_fencing_token,
    'expiresAt', floor(extract(epoch from v_expires) * 1000)::bigint
  );
end;
$$;

create or replace function public.fse_lease_release(
  p_name text,
  p_owner_id text,
  p_fencing_token bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.fse_leases
  where name = p_name
    and owner_id = p_owner_id
    and fencing_token = p_fencing_token;
  return found;
end;
$$;

create or replace function public.fse_job_enqueue(
  p_id text,
  p_queue text,
  p_kind text,
  p_payload jsonb,
  p_available_at bigint,
  p_max_attempts integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fse_jobs(
    id, queue, kind, payload, status, available_at, max_attempts
  )
  values (
    p_id, p_queue, p_kind, p_payload, 'QUEUED',
    to_timestamp(p_available_at / 1000.0), greatest(1, p_max_attempts)
  )
  on conflict (id) do nothing;

  return (
    select jsonb_build_object(
      'id', j.id,
      'queue', j.queue,
      'kind', j.kind,
      'payload', j.payload,
      'status', j.status,
      'availableAt', floor(extract(epoch from j.available_at) * 1000)::bigint,
      'attempts', j.attempts,
      'maxAttempts', j.max_attempts,
      'leaseOwner', j.lease_owner,
      'fencingToken', j.fencing_token,
      'leaseExpiresAt', case when j.lease_expires_at is null then null else floor(extract(epoch from j.lease_expires_at) * 1000)::bigint end,
      'createdAt', floor(extract(epoch from j.created_at) * 1000)::bigint,
      'updatedAt', floor(extract(epoch from j.updated_at) * 1000)::bigint,
      'lastError', j.last_error
    )
    from public.fse_jobs j where j.id = p_id
  );
end;
$$;

create or replace function public.fse_job_claim(
  p_queue text,
  p_owner_id text,
  p_lease_ms bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_token bigint;
  v_expires timestamptz;
begin
  select id into v_id
  from public.fse_jobs
  where queue = p_queue
    and status in ('QUEUED','RUNNING')
    and available_at <= now()
    and attempts < max_attempts
    and (lease_expires_at is null or lease_expires_at <= now())
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then return null; end if;

  v_token := nextval('public.fse_fencing_token_seq');
  v_expires := now() + make_interval(secs => greatest(p_lease_ms, 1)::double precision / 1000.0);

  update public.fse_jobs
  set status = 'RUNNING',
      attempts = attempts + 1,
      lease_owner = p_owner_id,
      fencing_token = v_token,
      lease_expires_at = v_expires,
      updated_at = now()
  where id = v_id;

  return (
    select jsonb_build_object(
      'id', j.id,
      'queue', j.queue,
      'kind', j.kind,
      'payload', j.payload,
      'status', j.status,
      'availableAt', floor(extract(epoch from j.available_at) * 1000)::bigint,
      'attempts', j.attempts,
      'maxAttempts', j.max_attempts,
      'leaseOwner', j.lease_owner,
      'fencingToken', j.fencing_token,
      'leaseExpiresAt', floor(extract(epoch from j.lease_expires_at) * 1000)::bigint,
      'createdAt', floor(extract(epoch from j.created_at) * 1000)::bigint,
      'updatedAt', floor(extract(epoch from j.updated_at) * 1000)::bigint,
      'lastError', j.last_error
    )
    from public.fse_jobs j where j.id = v_id
  );
end;
$$;

create or replace function public.fse_job_complete(
  p_id text,
  p_owner_id text,
  p_fencing_token bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fse_jobs
  set status = 'SUCCEEDED',
      lease_owner = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_id
    and status = 'RUNNING'
    and lease_owner = p_owner_id
    and fencing_token = p_fencing_token;
  return found;
end;
$$;

create or replace function public.fse_job_fail(
  p_id text,
  p_owner_id text,
  p_fencing_token bigint,
  p_error text,
  p_retry_at bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts integer;
  v_max integer;
begin
  select attempts, max_attempts into v_attempts, v_max
  from public.fse_jobs
  where id = p_id
    and status = 'RUNNING'
    and lease_owner = p_owner_id
    and fencing_token = p_fencing_token
  for update;

  if not found then return false; end if;

  update public.fse_jobs
  set status = case
        when p_retry_at is not null and v_attempts < v_max
          then 'QUEUED'
        else 'FAILED'
      end,
      available_at = case
        when p_retry_at is not null and v_attempts < v_max
          then to_timestamp(p_retry_at / 1000.0)
        else available_at
      end,
      lease_owner = null,
      fencing_token = null,
      lease_expires_at = null,
      last_error = left(coalesce(p_error, ''), 4000),
      updated_at = now()
  where id = p_id;

  return true;
end;
$$;

create or replace function public.fse_telemetry_emit(p_event jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fse_telemetry(
    id, at, instance_id, category, name, level, duration_ms, attributes
  )
  values (
    p_event->>'id',
    to_timestamp(((p_event->>'at')::bigint) / 1000.0),
    p_event->>'instanceId',
    p_event->>'category',
    p_event->>'name',
    p_event->>'level',
    nullif(p_event->>'durationMs','')::bigint,
    coalesce(p_event->'attributes', '{}'::jsonb)
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function public.fse_telemetry_recent(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'at', floor(extract(epoch from t.at) * 1000)::bigint,
        'instanceId', t.instance_id,
        'category', t.category,
        'name', t.name,
        'level', t.level,
        'durationMs', t.duration_ms,
        'attributes', t.attributes
      )
      order by t.at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from public.fse_telemetry
    order by at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) t;
$$;
