-- =====================================================================
-- NEXIO · Portal do Cliente / Painel da Equipe
-- Esquema de banco (Supabase / PostgreSQL) com segurança por linha (RLS)
-- Versão 1.0 · 18/11/2026
--
-- Princípios:
--  * Toda regra de acesso fica NO BANCO (RLS), não só na tela.
--  * Cliente só enxerga as empresas às quais o usuário está vinculado,
--    e dentro delas só os setores que o nível dele permite.
--  * Equipe só enxerga a carteira/setores que o nível dela permite.
--  * Certificado A1 e senha ficam no Supabase Vault (criptografado),
--    acessíveis apenas pela Edge Function de emissão (service_role).
--  * Registro de acessos é somente-inserção (ninguém altera ou apaga).
--  * Banco criptografado em repouso (AES-256) e conexões TLS: padrão
--    da plataforma. Região do projeto: sa-east-1 (São Paulo).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipos ----------
create type nivel_equipe  as enum ('admin','gestor','analista','atendimento','assistente');
create type nivel_cliente as enum ('titular','financeiro','rh','notas','consulta');
create type setor as enum ('Fiscal','Departamento Pessoal','Contábil','Financeiro','Societário',
                           'Certidões','Notas fiscais','Enviados pelo cliente','Administrativo (interno)');

-- ---------- Perfis (1:1 com auth.users) ----------
create table perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text not null,
  tipo        text not null check (tipo in ('equipe','cliente')),
  nivel_eq    nivel_equipe,
  setor_eq    setor,                       -- gestor/analista de um setor
  ativo       boolean not null default true,
  aceite_versao text,
  aceite_em   timestamptz,
  marketing   boolean not null default false,
  criado_em   timestamptz not null default now()
);

-- ---------- Empresas (clientes da NEXIO) ----------
create table empresas (
  id          uuid primary key default gen_random_uuid(),
  razao_social text not null,
  fantasia    text,
  documento   text not null unique,        -- CNPJ ou CPF (somente números)
  municipio_ibge char(7),
  trib        jsonb not null default '{}', -- regime, anexo, fator R, ISS, LC 116...
  inscricoes  jsonb not null default '{}',
  licencas    jsonb not null default '[]',
  socios      jsonb not null default '[]',
  responsavel uuid references perfis(id),  -- analista responsável na equipe
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- vínculo usuário-cliente <-> empresa (multiempresas)
create table empresa_usuarios (
  empresa_id uuid references empresas(id) on delete cascade,
  usuario_id uuid references perfis(id) on delete cascade,
  nivel      nivel_cliente not null,
  primary key (empresa_id, usuario_id)
);

-- carteira da equipe (quem atende quem)
create table carteira (
  empresa_id uuid references empresas(id) on delete cascade,
  usuario_id uuid references perfis(id) on delete cascade,
  primary key (empresa_id, usuario_id)
);

-- ---------- Documentos ----------
create table documentos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  setor       setor not null,
  pasta       text,
  tipo        text not null,               -- Guia, Nota fiscal, Relatório...
  titulo      text not null,
  competencia char(7),                     -- AAAA-MM
  vencimento  date,
  valor       numeric(14,2),
  status      text,
  storage_path text not null,              -- caminho no bucket privado
  hash_sha256 text not null,               -- integridade do arquivo
  enviado_por uuid references perfis(id),
  enviado_em  timestamptz not null default now(),
  excluido_em timestamptz                  -- lixeira (exclusão definitiva por rotina)
);
create index on documentos (empresa_id, setor, competencia);

-- ---------- Notas fiscais (NFS-e Nacional) ----------
create table nfse (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  serie       text not null,
  n_dps       bigint not null,
  chave       char(50),
  situacao    text not null default 'processando',
  tomador     jsonb not null,
  servico     jsonb not null,
  valores     jsonb not null,
  xml_path    text,
  emitida_por uuid references perfis(id),
  emitida_em  timestamptz not null default now(),
  unique (empresa_id, serie, n_dps)
);

-- ---------- Certificado digital (metadados; o segredo fica no Vault) ----------
create table certificados (
  empresa_id   uuid primary key references empresas(id) on delete cascade,
  titular_cn   text,
  validade     date not null,
  vault_pfx_id uuid not null,              -- vault.secrets (arquivo .pfx em base64)
  vault_pwd_id uuid not null,              -- vault.secrets (senha)
  autorizado_por uuid references perfis(id),
  autorizado_em  timestamptz not null default now()
);

-- ---------- Mensagens, notificações, LGPD ----------
create table mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  de text not null check (de in ('equipe','cliente')),
  autor uuid references perfis(id),
  texto text not null,
  lida boolean not null default false,
  em timestamptz not null default now()
);

create table notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  evento text not null, titulo text not null, texto text, link text,
  canais text[] not null default '{portal}',
  lida boolean not null default false,
  em timestamptz not null default now()
);

create table lgpd_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid references empresas(id),
  usuario_id uuid references perfis(id),
  tipo text not null, texto text not null,
  prazo date not null default (current_date + 15),
  status text not null default 'aberta',
  resposta text, respondida_por uuid references perfis(id), respondida_em timestamptz,
  em timestamptz not null default now()
);

create table incidentes (
  id uuid primary key default gen_random_uuid(),
  identificado_em date not null, descricao text not null, dados_afetados text not null,
  empresas_afetadas uuid[], risco text not null check (risco in ('Baixo','Médio','Alto')),
  medidas text, comunicado_anpd date, comunicado_titulares date,
  status text not null default 'Em apuração',
  registrado_por uuid references perfis(id), em timestamptz not null default now()
);

-- ---------- Registro de acessos (imutável) ----------
create table acessos (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  usuario_id uuid,
  empresa_id uuid,
  acao text not null,
  alvo text,
  ip inet,
  user_agent text
);
revoke update, delete on acessos from authenticated, anon;

-- =====================================================================
-- Funções auxiliares de permissão (SECURITY DEFINER, search_path fixo)
-- =====================================================================
create or replace function eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from perfis where id = auth.uid() and tipo = 'equipe' and ativo)
$$;

create or replace function nivel_eq() returns nivel_equipe
language sql stable security definer set search_path = public as $$
  select nivel_eq from perfis where id = auth.uid() and ativo
$$;

-- equipe: admin e gestor veem toda a carteira; demais, só a própria
create or replace function equipe_ve_empresa(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_equipe() and (nivel_eq() in ('admin','gestor')
     or exists(select 1 from carteira c where c.empresa_id = e and c.usuario_id = auth.uid()))
$$;

-- cliente: nível do usuário naquela empresa (null = sem acesso)
create or replace function nivel_cli(e uuid) returns nivel_cliente
language sql stable security definer set search_path = public as $$
  select eu.nivel from empresa_usuarios eu join perfis p on p.id = eu.usuario_id
   where eu.empresa_id = e and eu.usuario_id = auth.uid() and p.ativo
$$;

-- setores que cada nível de cliente pode ver
create or replace function cliente_ve_setor(e uuid, s setor) returns boolean
language sql stable security definer set search_path = public as $$
  select case nivel_cli(e)
    when 'titular'    then s <> 'Administrativo (interno)'
    when 'financeiro' then s in ('Fiscal','Contábil','Financeiro','Notas fiscais','Certidões','Enviados pelo cliente')
    when 'rh'         then s in ('Departamento Pessoal','Enviados pelo cliente')
    when 'notas'      then s = 'Notas fiscais'
    when 'consulta'   then s in ('Fiscal','Contábil','Certidões','Societário')
    else false end
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table perfis            enable row level security;
alter table empresas          enable row level security;
alter table empresa_usuarios  enable row level security;
alter table carteira          enable row level security;
alter table documentos        enable row level security;
alter table nfse              enable row level security;
alter table certificados      enable row level security;
alter table mensagens         enable row level security;
alter table notificacoes      enable row level security;
alter table lgpd_solicitacoes enable row level security;
alter table incidentes        enable row level security;
alter table acessos           enable row level security;

-- perfis: cada um vê o próprio; equipe vê todos; só admin altera
create policy perfis_sel on perfis for select using (id = auth.uid() or eh_equipe());
create or replace function meu_tipo() returns text
language sql stable security definer set search_path = public as $$
  select tipo from perfis where id = auth.uid()
$$;
create policy perfis_upd_self on perfis for update using (id = auth.uid())
  with check (id = auth.uid() and tipo = meu_tipo()
              and nivel_eq is not distinct from nivel_eq() );
create policy perfis_admin on perfis for all using (nivel_eq() = 'admin');

-- empresas
create policy emp_sel on empresas for select using (equipe_ve_empresa(id) or nivel_cli(id) is not null);
create policy emp_eq_upd on empresas for update using (equipe_ve_empresa(id) and nivel_eq() in ('admin','gestor','analista'));
create policy emp_admin on empresas for all using (nivel_eq() = 'admin');

-- vínculos: titular gerencia usuários da própria empresa
create policy eu_sel on empresa_usuarios for select using (usuario_id = auth.uid() or nivel_cli(empresa_id) = 'titular' or equipe_ve_empresa(empresa_id));
create policy eu_tit on empresa_usuarios for all using (nivel_cli(empresa_id) = 'titular') with check (nivel_cli(empresa_id) = 'titular');
create policy eu_eq  on empresa_usuarios for all using (nivel_eq() in ('admin','gestor'));
create policy cart_sel on carteira for select using (eh_equipe());
create policy cart_adm on carteira for all using (nivel_eq() in ('admin','gestor'));

-- documentos
create policy doc_cli_sel on documentos for select
  using (excluido_em is null and cliente_ve_setor(empresa_id, setor));
create policy doc_cli_ins on documentos for insert
  with check (nivel_cli(empresa_id) in ('titular','financeiro','rh') and setor = 'Enviados pelo cliente' and enviado_por = auth.uid());
create policy doc_eq_all on documentos for all
  using (equipe_ve_empresa(empresa_id))
  with check (equipe_ve_empresa(empresa_id));

-- notas fiscais
create policy nf_sel on nfse for select using (nivel_cli(empresa_id) in ('titular','financeiro','notas') or equipe_ve_empresa(empresa_id));
create policy nf_ins on nfse for insert with check (nivel_cli(empresa_id) in ('titular','financeiro','notas') and emitida_por = auth.uid());

-- certificados: só metadados; titular vê/remove; segredo nunca sai do Vault
create policy cert_sel on certificados for select using (nivel_cli(empresa_id) = 'titular' or equipe_ve_empresa(empresa_id));
create policy cert_del on certificados for delete using (nivel_cli(empresa_id) = 'titular');
-- inserção do certificado: somente via Edge Function (service_role) após upload seguro

-- mensagens e notificações
create policy msg_sel on mensagens for select using (nivel_cli(empresa_id) is not null or equipe_ve_empresa(empresa_id));
create policy msg_ins on mensagens for insert with check ((nivel_cli(empresa_id) is not null and de = 'cliente') or (equipe_ve_empresa(empresa_id) and de = 'equipe'));
create policy not_sel on notificacoes for select using (nivel_cli(empresa_id) is not null or equipe_ve_empresa(empresa_id));
create policy not_upd on notificacoes for update using (nivel_cli(empresa_id) is not null);

-- LGPD
create policy lgpd_sel on lgpd_solicitacoes for select using (usuario_id = auth.uid() or nivel_eq() = 'admin');
create policy lgpd_ins on lgpd_solicitacoes for insert with check (usuario_id = auth.uid());
create policy lgpd_upd on lgpd_solicitacoes for update using (nivel_eq() = 'admin');
create policy inc_adm on incidentes for all using (nivel_eq() = 'admin');

-- acessos: cada um vê os seus; admin vê todos; inserção apenas pela função registrar_acesso
create policy ac_sel on acessos for select using (usuario_id = auth.uid() or nivel_eq() = 'admin');

create or replace function registrar_acesso(p_empresa uuid, p_acao text, p_alvo text)
returns void language sql security definer set search_path = public as $$
  insert into acessos (usuario_id, empresa_id, acao, alvo, ip, user_agent)
  values (auth.uid(), p_empresa, p_acao, p_alvo,
          nullif(current_setting('request.headers', true)::json->>'x-forwarded-for','')::inet,
          current_setting('request.headers', true)::json->>'user-agent')
$$;

-- =====================================================================
-- Novo usuário (convite ou cadastro) -> cria o perfil automaticamente
-- Por padrão entra como 'cliente' sem empresa (não vê nada até ser vinculado)
-- =====================================================================
create or replace function novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email, tipo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email, 'cliente')
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function novo_usuario();

-- Permissões de API: só usuários logados; o que cada um vê é decidido pela RLS
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function registrar_acesso(uuid,text,text) to authenticated;
revoke update, delete on acessos from authenticated;  -- registro de acessos imutável

-- =====================================================================
-- Storage: bucket PRIVADO "documentos"
-- caminho: {empresa_id}/{setor}/{AAAA}/{MM}/{uuid}-{nome}
-- Download só por URL assinada de curta duração (ex.: 5 minutos).
-- =====================================================================
insert into storage.buckets (id, name, public) values ('documentos','documentos', false)
  on conflict (id) do nothing;

create policy sto_sel on storage.objects for select using (
  bucket_id = 'documentos' and (
    equipe_ve_empresa(((storage.foldername(name))[1])::uuid)
    or cliente_ve_setor(((storage.foldername(name))[1])::uuid, ((storage.foldername(name))[2])::setor)));

create policy sto_ins on storage.objects for insert with check (
  bucket_id = 'documentos' and (
    equipe_ve_empresa(((storage.foldername(name))[1])::uuid)
    or (nivel_cli(((storage.foldername(name))[1])::uuid) in ('titular','financeiro','rh')
        and (storage.foldername(name))[2] = 'Enviados pelo cliente')));

-- =====================================================================
-- Rotinas de retenção (agendar com pg_cron)
-- =====================================================================
-- select cron.schedule('lixeira', '0 3 * * *', $$
--   delete from documentos where excluido_em < now() - interval '30 days' $$);
--   (a Edge Function "limpeza" remove também os objetos correspondentes do Storage)
-- select cron.schedule('logs', '0 4 * * 0', $$
--   delete from acessos where em < now() - interval '180 days' $$);  -- mínimo legal: 6 meses
