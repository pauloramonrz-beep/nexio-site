-- NEXIO · migração 003 · sincronização completa do painel e do portal (18/11/2026)

-- 1) Campos livres para guardar o restante de cada registro
alter table empresas      add column if not exists dados jsonb not null default '{}';
alter table empresas      add column if not exists interno boolean not null default false;
alter table perfis        add column if not exists extra jsonb not null default '{}';
alter table documentos    add column if not exists meta jsonb not null default '{}';
alter table mensagens     add column if not exists meta jsonb not null default '{}';
alter table notificacoes  add column if not exists meta jsonb not null default '{}';
alter table nfse          add column if not exists meta jsonb not null default '{}';
alter table lgpd_solicitacoes add column if not exists meta jsonb not null default '{}';
alter table incidentes    add column if not exists meta jsonb not null default '{}';
alter table nfse alter column n_dps drop not null;
alter table nfse alter column serie drop not null;
alter table nfse drop constraint if exists nfse_empresa_id_serie_n_dps_key;

-- 2) Estado compartilhado da equipe (processos, agenda, obrigações, controle contábil, configurações)
create table if not exists estado (
  chave text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);
alter table estado enable row level security;
drop policy if exists estado_eq on estado;
create policy estado_eq on estado for all using (eh_equipe()) with check (eh_equipe());
grant select, insert, update, delete on estado to authenticated;

-- 3) Controle financeiro do cliente
create table if not exists financeiro (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  dados jsonb not null default '{}',
  atualizado_em timestamptz not null default now()
);
alter table financeiro enable row level security;
drop policy if exists fin_sel on financeiro;
drop policy if exists fin_all on financeiro;
create policy fin_sel on financeiro for select using (nivel_cli(empresa_id) in ('titular','financeiro') or equipe_ve_empresa(empresa_id));
create policy fin_all on financeiro for all using (nivel_cli(empresa_id) in ('titular','financeiro')) with check (nivel_cli(empresa_id) in ('titular','financeiro'));
grant select, insert, update, delete on financeiro to authenticated;

-- 4) Cliente pode atualizar só campos permitidos (visto, comentários, lida)
create or replace function protege_campos_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if eh_equipe() then return new; end if;
  if tg_table_name = 'documentos' then
    old.meta := new.meta;
    old.visto_em := coalesce(old.visto_em, new.visto_em);
    old.visto_por := coalesce(old.visto_por, new.visto_por);
    return old;
  elsif tg_table_name = 'mensagens' then
    old.lida := new.lida; return old;
  elsif tg_table_name = 'notificacoes' then
    old.lida := new.lida; old.meta := new.meta; return old;
  end if;
  return new;
end $$;
drop trigger if exists prot_doc on documentos;
create trigger prot_doc before update on documentos for each row execute function protege_campos_cliente();
drop trigger if exists prot_msg on mensagens;
create trigger prot_msg before update on mensagens for each row execute function protege_campos_cliente();
drop trigger if exists prot_not on notificacoes;
create trigger prot_not before update on notificacoes for each row execute function protege_campos_cliente();

drop policy if exists doc_cli_upd on documentos;
create policy doc_cli_upd on documentos for update using (cliente_ve_setor(empresa_id, setor));
drop policy if exists not_ins_cli on notificacoes;
create policy not_ins_cli on notificacoes for insert with check (nivel_cli(empresa_id) is not null);
drop policy if exists nf_upd on nfse;
create policy nf_upd on nfse for update using (nivel_cli(empresa_id) in ('titular','financeiro','notas') or equipe_ve_empresa(empresa_id));
drop policy if exists inc_adm on incidentes;
create policy inc_adm on incidentes for all using (nivel_eq() in ('admin','gestor')) with check (nivel_eq() in ('admin','gestor'));
drop policy if exists lgpd_upd on lgpd_solicitacoes;
create policy lgpd_upd on lgpd_solicitacoes for update using (nivel_eq() in ('admin','gestor'));
drop policy if exists lgpd_sel on lgpd_solicitacoes;
create policy lgpd_sel on lgpd_solicitacoes for select using (usuario_id = auth.uid() or nivel_eq() in ('admin','gestor'));

-- 5) Configurações que o cliente pode alterar na própria empresa
create or replace function cliente_config(p_empresa uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare permitido jsonb;
begin
  if nivel_cli(p_empresa) not in ('titular','financeiro') then raise exception 'sem_permissao'; end if;
  select coalesce(jsonb_object_agg(k, v), '{}') into permitido
    from jsonb_each(p_dados) as t(k, v)
   where k in ('nfCfg','notifPref','cert')
     and (k <> 'cert' or nivel_cli(p_empresa) = 'titular');
  update empresas set dados = dados || permitido where id = p_empresa;
end $$;
grant execute on function cliente_config(uuid, jsonb) to authenticated;

-- 6) Usuários do portal: vincular / listar / desvincular (equipe ou Titular)
create or replace function vincular_usuario(p_empresa uuid, p_email text, p_nivel nivel_cliente, p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not (equipe_ve_empresa(p_empresa) or nivel_cli(p_empresa) = 'titular') then raise exception 'sem_permissao'; end if;
  select id into uid from perfis where lower(email) = lower(p_email);
  if uid is null then raise exception 'usuario_nao_encontrado'; end if;
  if exists (select 1 from perfis where id = uid and tipo = 'equipe') then raise exception 'usuario_da_equipe'; end if;
  insert into empresa_usuarios (empresa_id, usuario_id, nivel) values (p_empresa, uid, p_nivel)
    on conflict (empresa_id, usuario_id) do update set nivel = excluded.nivel;
  if coalesce(p_nome, '') <> '' then update perfis set nome = p_nome where id = uid; end if;
  return uid;
end $$;
create or replace function desvincular_usuario(p_empresa uuid, p_usuario uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (equipe_ve_empresa(p_empresa) or nivel_cli(p_empresa) = 'titular') then raise exception 'sem_permissao'; end if;
  if p_usuario = auth.uid() then raise exception 'nao_pode_remover_a_si'; end if;
  delete from empresa_usuarios where empresa_id = p_empresa and usuario_id = p_usuario;
end $$;
create or replace function usuarios_da_empresa(p_empresa uuid)
returns table (id uuid, nome text, email text, nivel nivel_cliente, aceite_em timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.email, eu.nivel, p.aceite_em
    from empresa_usuarios eu join perfis p on p.id = eu.usuario_id
   where eu.empresa_id = p_empresa
     and (equipe_ve_empresa(p_empresa) or nivel_cli(p_empresa) = 'titular')
$$;
grant execute on function vincular_usuario(uuid, text, nivel_cliente, text) to authenticated;
grant execute on function desvincular_usuario(uuid, uuid) to authenticated;
grant execute on function usuarios_da_empresa(uuid) to authenticated;

-- 7) Equipe: transformar um usuário convidado em membro da equipe (só Administrador)
create or replace function promover_equipe(p_email text, p_nivel nivel_equipe, p_nome text, p_extra jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if nivel_eq() <> 'admin' then raise exception 'sem_permissao'; end if;
  select id into uid from perfis where lower(email) = lower(p_email);
  if uid is null then raise exception 'usuario_nao_encontrado'; end if;
  update perfis set tipo = 'equipe', nivel_eq = p_nivel, ativo = true,
         nome = coalesce(nullif(p_nome, ''), nome), extra = coalesce(p_extra, '{}')
   where id = uid;
  delete from empresa_usuarios where usuario_id = uid;
  return uid;
end $$;
grant execute on function promover_equipe(text, nivel_equipe, text, jsonb) to authenticated;

-- 8) Registro de acessos com nome (para a tela da equipe)
create or replace function acessos_recentes(p_limite int default 2000)
returns table (em timestamptz, nome text, tipo text, nivel text, empresa uuid, acao text, alvo text, ip inet)
language sql stable security definer set search_path = public as $$
  select a.em, coalesce(p.nome, '—'), coalesce(p.tipo, '—'), coalesce(p.nivel_eq::text, ''), a.empresa_id, a.acao, a.alvo, a.ip
    from acessos a left join perfis p on p.id = a.usuario_id
   where nivel_eq() in ('admin','gestor')
   order by a.em desc limit p_limite
$$;
grant execute on function acessos_recentes(int) to authenticated;

-- 9) Empresa interna (documentos do escritório)
insert into empresas (razao_social, fantasia, documento, interno, ativo)
values ('NEXIO INTELIGÊNCIA CONTÁBIL LTDA (interno)', 'NEXIO (documentos internos)', '67828768000129', true, false)
on conflict (documento) do update set interno = true, ativo = false;

-- 10) Permissões de API nas novas tabelas
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update, delete on acessos from authenticated;
