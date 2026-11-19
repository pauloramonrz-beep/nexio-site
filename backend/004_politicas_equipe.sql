-- NEXIO · migração 004 · equipe pode atualizar/excluir avisos, mensagens e notas dos seus clientes
drop policy if exists not_upd_eq on notificacoes;
create policy not_upd_eq on notificacoes for update using (equipe_ve_empresa(empresa_id));
drop policy if exists not_del_eq on notificacoes;
create policy not_del_eq on notificacoes for delete using (equipe_ve_empresa(empresa_id));
drop policy if exists msg_del_eq on mensagens;
create policy msg_del_eq on mensagens for delete using (equipe_ve_empresa(empresa_id));
drop policy if exists nf_ins_eq on nfse;
create policy nf_ins_eq on nfse for insert with check (equipe_ve_empresa(empresa_id));
drop policy if exists nf_del_eq on nfse;
create policy nf_del_eq on nfse for delete using (equipe_ve_empresa(empresa_id));
drop policy if exists lgpd_ins_eq on lgpd_solicitacoes;
create policy lgpd_ins_eq on lgpd_solicitacoes for insert with check (nivel_eq() in ('admin','gestor'));

-- pastas criadas pelo cliente também podem ser salvas
create or replace function cliente_config(p_empresa uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare permitido jsonb;
begin
  if nivel_cli(p_empresa) not in ('titular','financeiro','rh') then raise exception 'sem_permissao'; end if;
  select coalesce(jsonb_object_agg(k, v), '{}') into permitido
    from jsonb_each(p_dados) as t(k, v)
   where k in ('nfCfg','notifPref','cert','pastas')
     and (k <> 'cert' or nivel_cli(p_empresa) = 'titular')
     and (k = 'pastas' or nivel_cli(p_empresa) in ('titular','financeiro'));
  update empresas set dados = dados || permitido where id = p_empresa;
end $$;

-- notas: emissor padrão = usuário logado
alter table nfse alter column emitida_por set default auth.uid();
