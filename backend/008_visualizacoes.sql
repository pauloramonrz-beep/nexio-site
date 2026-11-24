-- 008 — Registro de quem visualizou/baixou cada documento (equipe e clientes)
create table if not exists doc_visualizacoes (
  id bigserial primary key,
  documento_id uuid not null references documentos(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  usuario uuid references perfis(id) on delete set null,
  nome text, email text, tipo text,      -- tipo: cliente | equipe
  acao text not null default 'Visualizou',
  em timestamptz not null default now()
);
create index if not exists docvis_doc on doc_visualizacoes(documento_id, em desc);
alter table doc_visualizacoes enable row level security;
drop policy if exists docvis_sel on doc_visualizacoes;
create policy docvis_sel on doc_visualizacoes for select using (equipe_ve_empresa(empresa_id));
grant select on doc_visualizacoes to authenticated;

create or replace function registrar_visualizacao(p_doc uuid, p_acao text default 'Visualizou') returns void
language plpgsql security definer set search_path = public as $$
declare d documentos; p perfis;
begin
  select * into d from documentos where id = p_doc;
  if d.id is null then return; end if;
  if not (equipe_ve_empresa(d.empresa_id) or (d.excluido_em is null and cliente_ve_setor(d.empresa_id, d.setor))) then return; end if;
  select * into p from perfis where id = auth.uid();
  insert into doc_visualizacoes(documento_id, empresa_id, usuario, nome, email, tipo, acao)
  values (d.id, d.empresa_id, auth.uid(), p.nome, p.email, p.tipo::text, case when p_acao in ('Visualizou','Baixou') then p_acao else 'Visualizou' end);
  if p.tipo::text = 'cliente' then
    update documentos set visto_em = coalesce(visto_em, now()), visto_por = coalesce(visto_por, auth.uid()) where id = d.id;
  end if;
end $$;
revoke all on function registrar_visualizacao(uuid, text) from public;
grant execute on function registrar_visualizacao(uuid, text) to authenticated;
