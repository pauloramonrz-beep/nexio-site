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

-- Cliente piloto: AUTO PARK VIEIRALVES LTDA
insert into empresas (razao_social, fantasia, documento, municipio_ibge, trib, inscricoes, licencas, socios)
values ('AUTO PARK VIEIRALVES LTDA','AUTO PARK VIEIRALVES','64367361000153','1302603',
 '{"regime":"SN","anexo":"III","cnae":"5223-1/00","porte":"ME","natureza":"206-2 Sociedade Empresária Limitada","abertura":"2026-01-08","mun":"Manaus/AM","obs":"Regime a confirmar"}',
 '{"im":"704927001","nire":"13201271851","cadastro_imobiliario":"18220","email":"contato@parkvieiralves.com.br","telefone":"(92) 9277-7585","endereco":"Rua Rio Içá, 16 - Nossa Senhora das Graças, Manaus/AM, 69053-100"}',
 '[{"tipo":"Alvará de funcionamento","numero":"AMB2500194344","orgao":"Prefeitura de Manaus (SEMEF)","emissao":"2026-01-09","validade":"","obs":"Validade indeterminada"}]',
 '[{"nome":"Adria Yared Sadala","part":"25","adm":true},{"nome":"Vinicius de Alencar Araujo Motta","part":"25","adm":false},{"nome":"Angelica Martins dos Santos","part":"25","adm":false},{"nome":"Francilourdes Morais Lourenco","part":"25","adm":false}]')
on conflict (documento) do nothing;

select razao_social, documento from empresas;
