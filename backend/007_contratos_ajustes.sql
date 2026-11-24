-- 007 — vencimento até dia 31 e registro de contratos assinados fora do sistema
alter table contratos drop constraint if exists contratos_dia_venc_check;
alter table contratos add constraint contratos_dia_venc_check check (dia_venc between 1 and 31);
alter table contratos add column if not exists assinatura_externa boolean not null default false;
