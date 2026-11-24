-- 005 — Contratos, honorários (faturas) e aceite eletrônico
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists contratos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references empresas(id) on delete cascade,
  status       text not null default 'rascunho' check (status in ('rascunho','enviado','assinado','encerrado')),
  plano        text,
  valor        numeric(12,2) not null default 0,
  dia_venc     int not null default 10 check (dia_venc between 1 and 28),
  inicio       date,
  fim          date,
  reajuste     text default 'IPCA, anualmente',
  texto        text not null default '',
  email_envio  text,
  token        uuid not null default gen_random_uuid() unique,
  enviado_em   timestamptz,
  assinado_em  timestamptz,
  assinado_nome text,
  assinado_doc text,
  assinado_ip  text,
  assinado_hash text,
  criado_por   uuid references perfis(id) default auth.uid(),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contratos_emp on contratos(empresa_id);

create table if not exists faturas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  contrato_id uuid references contratos(id) on delete set null,
  competencia text not null,               -- AAAA-MM
  descricao   text not null default 'Honorários contábeis',
  valor       numeric(12,2) not null default 0,
  vencimento  date not null,
  status      text not null default 'aberta' check (status in ('aberta','paga','cancelada')),
  pago_em     date,
  boleto_url  text,                        -- link do boleto (Inter)
  linha       text,                        -- linha digitável
  pix         text,                        -- PIX copia e cola
  criado_em   timestamptz not null default now()
);
create index if not exists faturas_emp on faturas(empresa_id, vencimento);

alter table contratos enable row level security;
alter table faturas enable row level security;

drop policy if exists ct_sel on contratos;
drop policy if exists ct_eq on contratos;
create policy ct_sel on contratos for select using (equipe_ve_empresa(empresa_id) or (nivel_cli(empresa_id) is not null and status <> 'rascunho'));
create policy ct_eq on contratos for all using (equipe_ve_empresa(empresa_id) and nivel_eq() in ('admin','gestor'))
  with check (equipe_ve_empresa(empresa_id) and nivel_eq() in ('admin','gestor'));

drop policy if exists ft_sel on faturas;
drop policy if exists ft_eq on faturas;
create policy ft_sel on faturas for select using (equipe_ve_empresa(empresa_id) or nivel_cli(empresa_id) in ('titular','financeiro'));
create policy ft_eq on faturas for all using (equipe_ve_empresa(empresa_id) and nivel_eq() in ('admin','gestor'))
  with check (equipe_ve_empresa(empresa_id) and nivel_eq() in ('admin','gestor'));

grant select, insert, update, delete on contratos, faturas to authenticated;

-- Leitura do contrato pelo link enviado por e-mail (sem login)
create or replace function contrato_por_token(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('empresa', e.razao_social, 'documento', e.documento, 'status', c.status,
    'texto', c.texto, 'plano', c.plano, 'valor', c.valor, 'inicio', c.inicio, 'fim', c.fim,
    'assinado_em', c.assinado_em, 'assinado_nome', c.assinado_nome)
  from contratos c join empresas e on e.id = c.empresa_id
  where c.token = p_token and c.status in ('enviado','assinado')
$$;

-- Aceite eletrônico: registra nome, CPF, data/hora, IP e o hash do texto aceito
create or replace function assinar_contrato(p_token uuid, p_nome text, p_doc text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare c contratos; ip text;
begin
  select * into c from contratos where token = p_token for update;
  if c.id is null or c.status <> 'enviado' then raise exception 'contrato_indisponivel'; end if;
  if length(trim(coalesce(p_nome,''))) < 5 or length(regexp_replace(coalesce(p_doc,''),'\D','','g')) not in (11,14) then
    raise exception 'dados_invalidos'; end if;
  begin ip := split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1);
  exception when others then ip := null; end;
  update contratos set status = 'assinado', assinado_em = now(), assinado_nome = trim(p_nome),
    assinado_doc = regexp_replace(p_doc,'\D','','g'), assinado_ip = ip,
    assinado_hash = encode(digest(texto, 'sha256'), 'hex'), atualizado_em = now()
   where id = c.id;
  return json_build_object('ok', true, 'em', now());
end $$;

revoke all on function contrato_por_token(uuid) from public;
revoke all on function assinar_contrato(uuid, text, text) from public;
grant execute on function contrato_por_token(uuid) to anon, authenticated;
grant execute on function assinar_contrato(uuid, text, text) to anon, authenticated;
