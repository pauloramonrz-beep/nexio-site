-- NEXIO · migração 002 · piloto (18/11/2026)
-- Storage: caminho {empresa_id}/{documento_id}-{arquivo} (equipe) ou {empresa_id}/cliente/{uuid}-{arquivo} (cliente)
drop policy if exists sto_sel on storage.objects;
drop policy if exists sto_ins on storage.objects;
drop policy if exists sto_del on storage.objects;

create policy sto_sel on storage.objects for select using (
  bucket_id = 'documentos' and (
    equipe_ve_empresa(((storage.foldername(name))[1])::uuid)
    or exists (select 1 from documentos d where d.storage_path = storage.objects.name
               and d.excluido_em is null and cliente_ve_setor(d.empresa_id, d.setor))));

create policy sto_ins on storage.objects for insert with check (
  bucket_id = 'documentos' and (
    equipe_ve_empresa(((storage.foldername(name))[1])::uuid)
    or (nivel_cli(((storage.foldername(name))[1])::uuid) in ('titular','financeiro','rh')
        and (storage.foldername(name))[2] = 'cliente')));

create policy sto_del on storage.objects for delete using (
  bucket_id = 'documentos' and equipe_ve_empresa(((storage.foldername(name))[1])::uuid)
  and nivel_eq() in ('admin','gestor','analista'));

-- documentos: quem viu e quando (cliente marca como visto)
alter table documentos add column if not exists visto_em timestamptz;
alter table documentos add column if not exists visto_por uuid references perfis(id);
alter table documentos add column if not exists nome_arquivo text;
alter table documentos add column if not exists tamanho bigint;
alter table documentos alter column hash_sha256 drop not null;

create or replace function marcar_visto(p_doc uuid) returns void
language sql security definer set search_path = public as $$
  update documentos set visto_em = coalesce(visto_em, now()), visto_por = coalesce(visto_por, auth.uid())
   where id = p_doc and excluido_em is null and cliente_ve_setor(empresa_id, setor)
$$;
grant execute on function marcar_visto(uuid) to authenticated;

-- mensagens: autor padrão; cliente/equipe marcam como lida
alter table mensagens alter column autor set default auth.uid();
alter table documentos alter column enviado_por set default auth.uid();
create policy msg_upd on mensagens for update using (nivel_cli(empresa_id) is not null or equipe_ve_empresa(empresa_id));

-- notificações: equipe cria; cliente lê/marca
create policy not_ins on notificacoes for insert with check (equipe_ve_empresa(empresa_id));

-- LGPD: cliente envia solicitação vinculada à empresa
alter table lgpd_solicitacoes alter column usuario_id set default auth.uid();

-- equipe pode atualizar perfil de clientes (nome) e vincular usuários
-- (perfis_admin e eu_eq já cobrem admin/gestor)

-- (cadastro dos clientes é feito pelo painel; dados de clientes não ficam no repositório)
