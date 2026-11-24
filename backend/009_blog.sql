-- 009 — Blog da NEXIO (site público + portal do cliente)
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  resumo text not null default '',
  conteudo text not null default '',
  categoria text not null default 'Geral',
  capa text,                               -- imagem (data URL comprimida)
  publicado boolean not null default false,
  so_clientes boolean not null default false, -- true: aparece só no portal
  publicado_em timestamptz,
  autor_nome text,
  criado_por uuid references perfis(id) default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists posts_pub on posts(publicado, publicado_em desc);
alter table posts enable row level security;
drop policy if exists posts_pub_sel on posts;
drop policy if exists posts_cli_sel on posts;
drop policy if exists posts_eq on posts;
create policy posts_pub_sel on posts for select to anon using (publicado and not so_clientes);
create policy posts_cli_sel on posts for select to authenticated using (publicado or eh_equipe());
create policy posts_eq on posts for all to authenticated using (eh_equipe()) with check (eh_equipe());
grant select on posts to anon;
grant select, insert, update, delete on posts to authenticated;
