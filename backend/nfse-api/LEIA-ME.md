# Serviço de emissão de NFS-e da NEXIO (API nacional)

Arquivos desta pasta vão para a hospedagem PHP (HostGator). O portal do cliente chama o `api.php`.

## Instalação (uma vez)
1. No cPanel, em **MultiPHP Manager**, deixe o domínio escolhido com **PHP 8.1 ou mais novo**.
2. No **Gerenciador de Arquivos**, dentro de `public_html` do domínio, crie a pasta `nfse-api` e envie `api.php` e `.htaccess`.
3. Publicado em `https://api.nexioic.com.br/nfse/api.php` (subdomínio na hospedagem rqcontabilidade.com.br). Teste com `?acao=status`. Todos os itens precisam aparecer como `true`.
4. Na primeira chamada o serviço cria, **fora** do `public_html`, a pasta `nexio_nfse_dados` com:
   - `chave.bin` — chave de criptografia do cofre (não apague: sem ela os certificados não abrem);
   - `certs/` — certificados A1 dos clientes, criptografados (AES-256-GCM);
   - `seq/` — controle da numeração das DPS.
5. Informe o endereço do `api.php` para atualizar `assets/nfse.js` (`NXN.URL`).

## Segurança
- O certificado e a senha vão do navegador direto para este serviço; não ficam no Supabase nem no navegador.
- Cada chamada confere o login no Supabase e a permissão do usuário na empresa (RLS).
- Só o Titular envia ou remove certificado; Titular, Financeiro e Notas emitem e cancelam.
- O certificado precisa ser do mesmo CNPJ/CPF da empresa e estar válido.
- Faça backup da pasta `nexio_nfse_dados` (principalmente `chave.bin`).

## Ambientes
- `restrita` → `https://sefin.producaorestrita.nfse.gov.br/SefinNacional` (testes, sem validade fiscal)
- `producao` → `https://sefin.nfse.gov.br/SefinNacional`
O ambiente de cada cliente é escolhido na Ficha do cliente (Serviços da nota fiscal → Emissão de NFS-e no portal).

## Limitações atuais
- Grupo IBS/CBS ainda não é enviado. Empresas fora do Simples/MEI são bloqueadas em produção.
- DANFSe: tenta o PDF oficial do ADN; se não estiver disponível, o portal gera o PDF a partir dos dados da nota.
