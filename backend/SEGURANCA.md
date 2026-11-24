# NEXIO · Especificação de segurança e criptografia (versão real)

Versão 1.0 · 18/11/2026. Guia para quem for desenvolver o servidor do Portal do Cliente e do Painel da Equipe. O protótipo atual (GitHub Pages + localStorage) **não** deve receber dados reais.

## 1. Arquitetura

| Camada | Tecnologia | Observação |
|---|---|---|
| Telas (site, portal, painel) | GitHub Pages (HTTPS obrigatório) | Somente arquivos estáticos; nenhum segredo no código |
| Login, banco e arquivos | Supabase, região **sa-east-1 (São Paulo)** | Banco PostgreSQL e Storage criptografados em repouso (AES-256) |
| Emissão de NFS-e | Supabase Edge Function `emitir-nfse` | Único componente que lê o certificado no Vault |
| E-mails | Serviço transacional (ex.: Resend) | Domínio com SPF, DKIM e DMARC |

## 2. Criptografia

- **Em trânsito:** TLS 1.2+ em todas as conexões (site, API, banco, Sefin Nacional via mTLS com o certificado do cliente).
- **Em repouso:** disco do banco e Storage criptografados pela plataforma (AES-256); backups também criptografados.
- **Certificado A1 e senha:** guardados no **Supabase Vault** (criptografia autenticada, chave gerenciada fora do banco). A tabela `certificados` guarda apenas metadados e os IDs dos segredos. Nenhuma política permite leitura do segredo por usuários; só a Edge Function, com `service_role`, o lê em memória para assinar e transmitir a DPS e descarta em seguida.
- **Upload do certificado:** feito direto para a Edge Function `salvar-certificado`, que valida o .pfx com a senha, lê CN e validade, grava no Vault e **nunca** devolve o arquivo. O arquivo não passa pelo Storage.
- **Senhas de usuários:** gerenciadas pelo Supabase Auth (hash bcrypt). Política mínima: 10 caracteres, bloqueio após tentativas falhas.
- **Integridade dos arquivos:** SHA-256 de cada documento gravado em `documentos.hash_sha256`.

## 3. Controle de acesso

- **RLS em todas as tabelas** (ver `schema.sql`): o banco recusa qualquer leitura fora do nível do usuário, mesmo que alguém altere a tela.
- **Níveis do cliente:** Titular, Financeiro, RH, Emissor de notas, Consulta, cada um limitado aos setores definidos em `cliente_ve_setor`.
- **Níveis da equipe:** Administrador e Gestor veem toda a carteira; Analista, Atendimento e Assistente, só os clientes da sua carteira.
- **Verificação em duas etapas (TOTP)** obrigatória para toda a equipe e recomendada para Titulares.
- **Sessão:** o login fica salvo no navegador até a pessoa clicar em Sair; token de acesso curto (1 h) com renovação automática. Senha mínima de 8 caracteres.
- **Arquivos:** bucket privado; download apenas por URL assinada de 5 minutos.
- **Desligamento:** desativar o perfil (`ativo = false`) revoga o acesso imediatamente em todas as políticas.

## 4. Registro e monitoramento

- Tabela `acessos` somente-inserção (sem UPDATE/DELETE para usuários), com usuário, empresa, ação, alvo, IP e navegador.
- Eventos obrigatórios: login, falha de login, visualização, download, envio, exclusão, emissão e cancelamento de nota, alteração de usuários, uso do certificado.
- Alertas: muitos downloads em pouco tempo, login de outro país, falhas de login repetidas.
- Guarda dos registros: mínimo de 6 meses (Marco Civil da Internet, art. 15).

## 5. Retenção e eliminação

- Lixeira: exclusão definitiva automática após 30 dias (`pg_cron` + Edge Function de limpeza do Storage).
- Documentos fiscais e contábeis: prazo legal (mínimo 5 anos); trabalhistas/previdenciários: prazos próprios.
- Encerramento de contrato: 30 dias para o cliente baixar os arquivos; depois, eliminação, salvo guarda legal.

## 6. Cabeçalhos e boas práticas no front-end

- Nada de segredos no código (somente a chave pública `anon` do Supabase).
- Content-Security-Policy restrita aos domínios usados (site, Supabase, Google Fonts, cdnjs para o leitor de PDF).
- Sanitização de todo texto exibido (já aplicada no protótipo com `NX.esc`).
- Dependências fixadas em versões e revisadas.

## 7. Continuidade e incidentes

- Backup diário com retenção de 7 dias (Supabase Pro) + exportação semanal para o OneDrive da NEXIO.
- Roteiro de incidente: conter → avaliar risco → registrar no módulo LGPD → comunicar ANPD e titulares quando houver risco ou dano relevante → corrigir → revisar.
- Teste de restauração de backup a cada 3 meses.

## 8. Checklist antes de colocar no ar

- [ ] Projeto Supabase em São Paulo, plano Pro, backups ativos
- [ ] `schema.sql` aplicado e RLS testada com um usuário de cada nível
- [ ] 2FA ativo para toda a equipe
- [ ] Vault configurado e Edge Functions `salvar-certificado` e `emitir-nfse` revisadas
- [ ] Domínio de e-mail com SPF, DKIM e DMARC
- [x] Encarregado designado: Paulo Ramon Zani Batista (contato@nexioic.com.br)
- [ ] Substituto do encarregado designado e publicado
- [ ] Contrato com fornecedores (Supabase, e-mail) com cláusulas de proteção de dados
- [ ] Anexo de proteção de dados assinado com os clientes
- [ ] Teste de invasão básico (OWASP Top 10) antes do lançamento
