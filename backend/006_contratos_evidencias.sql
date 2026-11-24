-- 006 — Contratos: fidelidade, trilha de auditoria e travamento após assinatura
alter table contratos add column if not exists fidelidade_meses int not null default 0;
alter table contratos add column if not exists multa_fidelidade text;
alter table contratos add column if not exists enviado_por uuid references perfis(id);
alter table contratos add column if not exists enviado_hash text;
alter table contratos add column if not exists assinado_ua text;
alter table contratos add column if not exists assinado_uid uuid;
alter table contratos add column if not exists assinado_email text;

-- trilha de auditoria (visualizações, envio, assinatura)
create table if not exists contrato_eventos (
  id bigserial primary key,
  contrato_id uuid not null references contratos(id) on delete cascade,
  evento text not null,
  em timestamptz not null default now(),
  ip text, ua text, usuario uuid, detalhe text
);
alter table contrato_eventos enable row level security;
drop policy if exists cev_sel on contrato_eventos;
create policy cev_sel on contrato_eventos for select using (exists(select 1 from contratos c where c.id = contrato_id and equipe_ve_empresa(c.empresa_id)));
grant select on contrato_eventos to authenticated;

create or replace function _req_ip() returns text language plpgsql stable as $$
begin return split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1);
exception when others then return null; end $$;
create or replace function _req_ua() returns text language plpgsql stable as $$
begin return left(current_setting('request.headers', true)::json->>'user-agent', 300);
exception when others then return null; end $$;

-- texto e condições ficam travados depois de assinado; envio registra hash e evento
create or replace function contratos_guarda() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'UPDATE' and old.status = 'assinado' and (new.texto is distinct from old.texto or new.valor is distinct from old.valor
     or new.inicio is distinct from old.inicio or new.fim is distinct from old.fim or new.fidelidade_meses is distinct from old.fidelidade_meses
     or new.multa_fidelidade is distinct from old.multa_fidelidade or new.dia_venc is distinct from old.dia_venc
     or new.assinado_em is distinct from old.assinado_em or new.assinado_hash is distinct from old.assinado_hash or new.empresa_id is distinct from old.empresa_id) then
    raise exception 'contrato_assinado_nao_pode_ser_alterado';
  end if;
  if new.status = 'enviado' and (tg_op = 'INSERT' or old.status <> 'enviado' or new.texto is distinct from old.texto) then
    new.enviado_hash := encode(digest(new.texto, 'sha256'), 'hex');
    new.enviado_por := coalesce(auth.uid(), new.enviado_por);
    new.enviado_em := now();
    if tg_op = 'UPDATE' and old.status = 'enviado' and new.texto is distinct from old.texto then
      new.token := gen_random_uuid();  -- link antigo deixa de valer se o texto mudou
    end if;
  end if;
  return new;
end $$;
drop trigger if exists contratos_guarda on contratos;
create trigger contratos_guarda before insert or update on contratos for each row execute function contratos_guarda();

create or replace function contratos_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'enviado' and (tg_op = 'INSERT' or old.status <> 'enviado' or new.enviado_hash is distinct from old.enviado_hash) then
    insert into contrato_eventos(contrato_id, evento, ip, ua, usuario, detalhe)
    values (new.id, 'Enviado para assinatura', _req_ip(), _req_ua(), auth.uid(), 'para '||coalesce(new.email_envio,'—')||' · SHA-256 '||new.enviado_hash);
  end if;
  if tg_op = 'UPDATE' and new.status = 'encerrado' and old.status <> 'encerrado' then
    insert into contrato_eventos(contrato_id, evento, usuario) values (new.id, 'Contrato encerrado', auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists contratos_log on contratos;
create trigger contratos_log after insert or update on contratos for each row execute function contratos_log();

-- leitura pelo link: registra a visualização
drop function if exists contrato_por_token(uuid);
create or replace function contrato_por_token(p_token uuid) returns json
language plpgsql volatile security definer set search_path = public as $$
declare c contratos; e empresas;
begin
  select * into c from contratos where token = p_token and status in ('enviado','assinado');
  if c.id is null then return null; end if;
  select * into e from empresas where id = c.empresa_id;
  if c.status = 'enviado' then
    insert into contrato_eventos(contrato_id, evento, ip, ua, usuario) values (c.id, 'Contrato aberto para leitura', _req_ip(), _req_ua(), auth.uid());
  end if;
  return json_build_object('empresa', e.razao_social, 'documento', e.documento, 'status', c.status, 'texto', c.texto,
    'plano', c.plano, 'valor', c.valor, 'inicio', c.inicio, 'fim', c.fim, 'fidelidade_meses', c.fidelidade_meses,
    'assinado_em', c.assinado_em, 'assinado_nome', c.assinado_nome, 'assinado_doc', c.assinado_doc,
    'assinado_ip', c.assinado_ip, 'assinado_hash', c.assinado_hash, 'assinado_email', c.assinado_email, 'id', c.id);
end $$;

drop function if exists assinar_contrato(uuid, text, text);
create or replace function assinar_contrato(p_token uuid, p_nome text, p_doc text, p_ua text default null) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare c contratos; ip text := _req_ip(); ua text := coalesce(_req_ua(), left(p_ua,300)); em text; h text;
begin
  select * into c from contratos where token = p_token for update;
  if c.id is null or c.status <> 'enviado' then raise exception 'contrato_indisponivel'; end if;
  if length(trim(coalesce(p_nome,''))) < 5 or length(regexp_replace(coalesce(p_doc,''),'\D','','g')) not in (11,14) then
    raise exception 'dados_invalidos'; end if;
  h := encode(digest(c.texto, 'sha256'), 'hex');
  if c.enviado_hash is not null and h <> c.enviado_hash then raise exception 'texto_divergente'; end if;
  select email into em from perfis where id = auth.uid();
  update contratos set status = 'assinado', assinado_em = now(), assinado_nome = trim(p_nome),
    assinado_doc = regexp_replace(p_doc,'\D','','g'), assinado_ip = ip, assinado_ua = ua,
    assinado_uid = auth.uid(), assinado_email = em, assinado_hash = h, atualizado_em = now()
   where id = c.id;
  insert into contrato_eventos(contrato_id, evento, ip, ua, usuario, detalhe)
  values (c.id, 'Assinado eletronicamente', ip, ua, auth.uid(),
          trim(p_nome)||' · CPF/CNPJ '||regexp_replace(p_doc,'\D','','g')||coalesce(' · conta do portal '||em,'')||' · SHA-256 '||h);
  return json_build_object('ok', true, 'em', now(), 'hash', h);
end $$;

-- eventos públicos do próprio contrato (para o certificado), via token
create or replace function contrato_eventos_token(p_token uuid) returns table(evento text, em timestamptz, ip text, detalhe text)
language sql stable security definer set search_path = public as $$
  select ev.evento, ev.em, ev.ip, ev.detalhe from contrato_eventos ev join contratos c on c.id = ev.contrato_id
   where c.token = p_token and c.status = 'assinado' order by ev.em
$$;

revoke all on function contrato_por_token(uuid) from public;
revoke all on function assinar_contrato(uuid, text, text, text) from public;
revoke all on function contrato_eventos_token(uuid) from public;
grant execute on function contrato_por_token(uuid) to anon, authenticated;
grant execute on function assinar_contrato(uuid, text, text, text) to anon, authenticated;
grant execute on function contrato_eventos_token(uuid) to anon, authenticated;
