# CDCentral Rastreamento

Site institucional da CDCentral Rastreamento com landing page, formulário de captação de leads e integração com Supabase.

## Visão geral

O projeto é uma aplicação Node.js de produção que serve HTML, CSS e JavaScript puros, além das rotas de API para leads em `/api/leads`.

O site foi pensado para:

- apresentar os serviços de rastreamento veicular e gestão de frotas;
- direcionar o usuário para WhatsApp, Instagram, e-mail e mapa;
- captar contatos comerciais pelo formulário;
- salvar os leads em uma tabela do Supabase.

## Stack usada

- HTML estático
- CSS puro
- JavaScript vanilla no frontend
- Node.js para servidor HTTP permanente
- rotas HTTP em `api/`
- Supabase como armazenamento dos leads
- Upstash Redis recomendado para rate limit distribuído
- Cloudflare Turnstile recomendado para verificação antiabuso

## Estrutura do projeto

```text
.
|-- server.js
|-- package.json
|-- package-lock.json
|-- config/pm2/ecosystem.config.cjs
|-- docs/deploy/HOSTINGER.md
|-- docs/deploy/VPS.md
|-- vercel.json
|-- api/
|   |-- csp-report.js
|   |-- leads.js
|   `-- public-config.js
|-- lib/
|   |-- app-config.js
|   |-- http-utils.js
|   `-- leads-service.js
|-- database/supabase/
|   `-- leads-schema.sql
|-- public/
|   |-- index.html
|   |-- politica-de-privacidade.html
|   |-- termos-de-uso.html
|   |-- robots.txt
|   |-- sitemap.xml
|   |-- .well-known/
|   |   `-- security.txt
|   `-- assets/
|       |-- css/styles.css
|       |-- js/script.js
|       |-- fonts/
|       `-- images/cdcentral/
`-- .env.example
```

## Arquivos principais

- [public/index.html](./public/index.html)
  Página principal do site. Contém:
  hero, soluções, benefícios, como funciona, contato, CTA final e rodapé.

- [public/assets/css/styles.css](./public/assets/css/styles.css)
  Todo o visual do projeto: layout, responsividade, animações, fundo, cards, formulário, menu mobile e footer.

- [public/assets/js/script.js](./public/assets/js/script.js)
  Controla:
  menu mobile, animação de reveal, ano automático no rodapé, máscara do WhatsApp, validação do formulário e envio para `/api/leads`.

- [server.js](./server.js)
  Servidor principal de produção. Serve arquivos públicos, aplica headers/cache/logs, expõe `/health` e encaminha `/api/leads`, `/api/public-config` e `/api/csp-report`.

- [config/pm2/ecosystem.config.cjs](./config/pm2/ecosystem.config.cjs)
  Configuração opcional de PM2 para VPS.

- [docs/deploy/HOSTINGER.md](./docs/deploy/HOSTINGER.md) e [docs/deploy/VPS.md](./docs/deploy/VPS.md)
  Guias de deploy para Hostinger Node.js Web App e VPS.

- [scripts/update-csp-hash.js](./scripts/update-csp-hash.js)
  Atualiza o hash CSP do JSON-LD inline quando o bloco estruturado em [public/index.html](./public/index.html) for editado.

- [scripts/validate-runtime-env.js](./scripts/validate-runtime-env.js)
  Confere variaveis de staging/producao sem imprimir segredos.

- [scripts/smoke-supabase-lead.js](./scripts/smoke-supabase-lead.js)
  Faz um insert real e identificado no Supabase para validar a gravacao server-side.

- [scripts/smoke-deploy.js](./scripts/smoke-deploy.js)
  Valida uma URL publicada, incluindo HTML, `/api/public-config`, Turnstile e assets otimizados.

- [scripts/optimize-images.js](./scripts/optimize-images.js)
  Gera WebPs responsivos e recomprime os PNGs de fallback.

- [public/robots.txt](./public/robots.txt) e [public/sitemap.xml](./public/sitemap.xml)
  Arquivos de SEO técnico. Antes de publicar, confirme se o domínio configurado está correto.

- [api/leads.js](./api/leads.js)
  Endpoint responsável por validar requisições, aplicar CORS, limitar tentativas e persistir o lead.

- [lib/http-utils.js](./lib/http-utils.js)
  Utilitários de parsing JSON, erro HTTP controlado e rate limit com Redis/KV quando configurado. Em desenvolvimento usa fallback em memória; em produção, `/api/leads` exige Redis/KV por padrão, salvo opt-out explícito.

- [lib/app-config.js](./lib/app-config.js)
  Configuração compartilhada do backend, incluindo a versão vigente de consentimento usada por `/api/public-config` e `/api/leads`.

- [lib/leads-service.js](./lib/leads-service.js)
  Regras de normalização, validação e envio dos dados para o Supabase.

- [database/supabase/leads-schema.sql](./database/supabase/leads-schema.sql)
  Estrutura esperada da tabela de leads, com RLS ativado e constraints básicas de qualidade dos dados.

## Seções da landing page

O conteúdo do site está centralizado em [public/index.html](./public/index.html).

As principais áreas são:

- `#inicio`
  Hero principal com CTA para WhatsApp e solicitação de orçamento.

- `#solucoes`
  Blocos separados para pessoa física e empresas/frotas.

- `#beneficios`
  Cards com diferenciais do serviço.

- `#como-funciona`
  Passo a passo de contratação/uso.

- `#contato`
  Informações rápidas de contato e formulário de lead.

- `footer`
  Informações institucionais, canais de contato e links legais.

## Como editar o conteúdo

### Textos e links

Edite diretamente [public/index.html](./public/index.html).

Exemplos de mudança:

- títulos e textos das seções;
- links de WhatsApp;
- e-mail, Instagram, telefone e mapa;
- textos de botões;
- textos do rodapé.

### Estilo visual

Edite [public/assets/css/styles.css](./public/assets/css/styles.css).

Os tokens principais ficam no seletor `:root`, como:

- `--bg-main`
- `--bg-soft`
- `--primary`
- `--amber`
- `--text`
- `--muted`

Os breakpoints atuais cuidam de mobile, tablet e desktop.

### Comportamentos do frontend

Edite [public/assets/js/script.js](./public/assets/js/script.js).

Hoje o script cobre:

- abertura e fechamento do menu mobile;
- troca de estado do header ao rolar;
- máscara do campo WhatsApp;
- validação dos campos;
- envio assíncrono do formulário;
- mensagens de sucesso e erro.

## Formulário de leads

### Campos do lead

Os campos principais do formulário são:

- `nome`
- `whatsapp`
- `tipo`
- `veiculos`
- `consent`
- `consentVersion`
- `cf-turnstile-response`

O backend também reconhece campos auxiliares de proteção quando presentes:

- `empresa`
- `startedAt`

No fluxo do site, `startedAt` é enviado pelo formulário e usado como sinal anti-spam. Quando o Cloudflare Turnstile está configurado, o token `cf-turnstile-response` é gerado no navegador e validado no backend antes de gravar o lead.

### Regras de validação

No frontend e backend, o lead precisa ter:

- nome com ao menos 3 caracteres;
- WhatsApp com 10 ou 11 dígitos;
- tipo preenchido;
- quantidade de veículos maior ou igual a 1;
- consentimento LGPD marcado com a versão vigente;
- token Turnstile válido quando a proteção estiver configurada/obrigatória.

### Proteções existentes

O endpoint possui proteções simples contra abuso:

- validação de origem por CORS;
- bloqueio de requisições cross-site sinalizadas por `Sec-Fetch-Site`;
- exigência de `Origin` válido em produção;
- rate limit por IP com chave `rl:ip:<ip>` de 5 requisições a cada 10 minutos;
- rate limit por WhatsApp com chave `rl:wpp:<digits>` de 3 requisições a cada 24 horas;
- Redis/KV exigido por padrão em produção para rate limit distribuído; fallback em memória fica restrito ao desenvolvimento ou a opt-out explícito;
- validação server-side do Cloudflare Turnstile quando as chaves estão configuradas ou `REQUIRE_TURNSTILE=1`;
- consentimento LGPD obrigatório e persistido com data, versão e IP;
- campo honeypot `empresa`;
- verificação de tempo mínimo de preenchimento via `startedAt`.
- limite de tamanho do payload JSON;
- rejeição de content types inesperados;
- rejeição de JSON que não seja objeto;
- timeout na chamada ao Supabase.

## Fluxo da API

1. O usuário preenche o formulário na landing page.
2. O frontend envia um `POST` para `/api/leads`.
3. [api/leads.js](./api/leads.js) valida método, origem, payload e limite de requisições.
4. [lib/leads-service.js](./lib/leads-service.js) normaliza os dados e envia para o Supabase.
5. O frontend mostra retorno de sucesso ou erro ao usuário.

## Notificações e e-mail

O projeto atual não possui integração com Resend, SMTP ou outro serviço de notificação. A API apenas grava o lead no Supabase. Se for necessário enviar e-mail ou WhatsApp operacional a cada lead, implemente esse disparo no backend ou em uma função controlada por evento do banco, nunca diretamente no frontend.

Fluxo recomendado:

```text
lead gravado no Supabase
-> trigger ou job backend
-> função segura com env vars server-side
-> provedor de e-mail/notificação
-> log controlado de sucesso/falha
```

## Variáveis de ambiente

Use [`.env.example`](./.env.example) como base.

Exemplo:

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
TRUST_PROXY_HEADERS=1
ALLOW_LOCAL_ORIGINS=0
REQUIRE_REQUEST_ORIGIN=1
CONSENT_VERSION=2026-04-28
SITE_URL=https://seudominio.com.br
ALLOWED_ORIGINS=https://seudominio.com.br
ENABLE_CANONICAL_REDIRECT=0
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_LEADS_INSERT_KEY=your_server_side_insert_key
SUPABASE_LEADS_TABLE=leads
REQUIRE_TURNSTILE=1
TURNSTILE_SITE_KEY=your_public_turnstile_site_key
TURNSTILE_SECRET_KEY=your_private_turnstile_secret_key
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
REQUIRE_EXTERNAL_RATE_LIMIT=1
ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION=0
```

### Descrição das variáveis

- `SUPABASE_URL`
  URL do projeto no Supabase.

- `SUPABASE_LEADS_INSERT_KEY`
  Chave server-side usada pela API para inserir leads. Prefira uma chave restrita para inserção. Não use chave publishable/anon aqui e não exponha essa variável no frontend.
  Com o schema padrão deste projeto, use service_role/secret key somente no backend; anon/publishable key é recusada pela API. Por compatibilidade, `SUPABASE_SERVICE_ROLE_KEY` também é aceita como fallback server-side.

- `SUPABASE_LEADS_TABLE`
  Nome da tabela onde os leads serão salvos.

- `SITE_URL`
  URL principal do site em produção.

- `ALLOWED_ORIGINS`
  Lista de origens extras liberadas no CORS, separadas por vírgula.

- `ENABLE_CANONICAL_REDIRECT`
  Use `1` somente depois que o domínio em `SITE_URL` estiver resolvendo publicamente. Quando desligado, hosts auxiliares não são redirecionados para evitar indisponibilidade por DNS incompleto.

- `NODE_ENV`
  Use `production` em Hostinger/VPS e `development` localmente.

- `PORT`
  Porta usada pelo servidor. O app escuta em `0.0.0.0`.

- `HOST`
  Interface usada pelo servidor. Use `0.0.0.0` na Hostinger Node.js Web App e `127.0.0.1` em VPS atrás de Nginx.

- `TRUST_PROXY_HEADERS`
  Use `1` quando estiver atrás de proxy da Hostinger ou Nginx para registrar o IP real via `X-Forwarded-For`.

- `ALLOW_LOCAL_ORIGINS`
  Use `1` apenas quando precisar liberar origens locais fora do modo desenvolvimento.

- `REQUIRE_REQUEST_ORIGIN`
  Use `1` em produção para exigir `Origin` válido em `POST /api/leads`.

- `TURNSTILE_SITE_KEY`
  Chave pública do widget Cloudflare Turnstile. Ela é entregue ao navegador por `/api/public-config`.

- `TURNSTILE_SECRET_KEY`
  Chave secreta server-side usada para validar `cf-turnstile-response`. Não exponha no frontend.

- `REQUIRE_TURNSTILE`
  Use `1` para exigir Turnstile em produção. Se as chaves ainda não foram criadas, use `0` temporariamente para manter o formulário ativo sem derrubar `/api/public-config`.

- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
  Credenciais REST do Upstash Redis para rate limit distribuído.
  Recomendadas em produção para rate limit distribuído.

- `REQUIRE_EXTERNAL_RATE_LIMIT`
  Use `1` para explicitar que Redis/KV é obrigatório em produção. Em runtime publicado, esse é o comportamento padrão. Use `0` somente se aceitar fallback em memória.

- `CONSENT_VERSION`
  Versão vigente do consentimento LGPD entregue por `/api/public-config` e validada por `/api/leads`.

- `ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION`
  Mantenha `0`. Use `1` somente se aceitar fallback em memória em um único processo Node, sem rate limit distribuído.

## Como rodar localmente

Pré-requisito recomendado:

- Node.js 20 ou superior

### Passos

1. Crie um `.env.local` com base no `.env.example`.
2. Preencha as credenciais do Supabase. Turnstile e Upstash/KV são recomendados em produção; em produção, configure Upstash/KV antes de publicar ou faça opt-out consciente com `REQUIRE_EXTERNAL_RATE_LIMIT=0`.
3. Instale as dependências:

```powershell
npm install
```

4. Rode a validação estrutural e os testes automatizados:

```powershell
npm run build
npm test
```

5. Inicie o servidor local:

```powershell
npm run dev
```

6. Acesse:

```text
http://127.0.0.1:3000
```

Health check local:

```powershell
curl.exe -i http://127.0.0.1:3000/health
```

## Validacao de staging/producao

Para Vercel, puxe as variaveis do ambiente antes de validar. Os arquivos `.env.*.local` continuam ignorados pelo Git:

```powershell
npx vercel env pull .env.production.local --environment=production --yes
node scripts/validate-runtime-env.js --env=.env.production.local --target=production --domain=cdcentralrastreamento.com.br
```

Para staging/preview, use um arquivo separado e ajuste o dominio esperado:

```powershell
npx vercel env pull .env.staging.local --environment=preview --yes
node scripts/validate-runtime-env.js --env=.env.staging.local --target=staging --domain=staging.seudominio.com.br
```

Depois de confirmar as variaveis, valide a gravacao real no Supabase. O comando insere uma linha com prefixo `[SMOKE]` na tabela configurada:

```powershell
node scripts/smoke-supabase-lead.js --env=.env.production.local --target=production --confirm-write
```

Depois do deploy publicado, rode um smoke test contra a URL real para confirmar DNS, headers, `/api/public-config`, Turnstile e asset otimizado:

```powershell
node scripts/smoke-deploy.js --url=https://cdcentralrastreamento.com.br
```

Se estiver validando um ambiente temporario sem Turnstile, use `--allow-turnstile-disabled` apenas nesse ambiente.

## Publicação

O projeto deve ser publicado como aplicação Node.js permanente. Para Hostinger Node.js Web App, use [docs/deploy/HOSTINGER.md](./docs/deploy/HOSTINGER.md). Para VPS com PM2 e Nginx, use [docs/deploy/VPS.md](./docs/deploy/VPS.md).

Pontos importantes na publicação:

- configurar corretamente as variáveis de ambiente;
- se editar o JSON-LD em [public/index.html](./public/index.html), rodar `node scripts/update-csp-hash.js` antes de deploy Vercel; `npm run build` agora falha quando o hash ficar desatualizado;
- garantir que o domínio final esteja em `SITE_URL`;
- manter `ENABLE_CANONICAL_REDIRECT=0` até o domínio final resolver em DNS e só então ativar o redirect canônico;
- revisar `robots.txt`, `sitemap.xml` e os metadados canônicos se o domínio final não for `https://cdcentralrastreamento.com.br`;
- liberar previews e ambientes auxiliares em `ALLOWED_ORIGINS`;
- manter `SUPABASE_LEADS_INSERT_KEY` configurada no ambiente de produção;
- configurar `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` antes de usar `REQUIRE_TURNSTILE=1`;
- configurar `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` antes de usar `REQUIRE_EXTERNAL_RATE_LIMIT=1`;
- aplicar [database/supabase/leads-schema.sql](./database/supabase/leads-schema.sql) e validar se a tabela aceita os campos esperados;
- rodar `node scripts/validate-runtime-env.js`, `node scripts/smoke-supabase-lead.js` e `node scripts/smoke-deploy.js` para fechar a validacao do ambiente real.

### Estratégia Supabase/RLS

O schema deixa `public.leads` com RLS ativo e sem permissões para `anon`/`authenticated`. Isso é intencional: o navegador nunca grava diretamente na tabela. A rota `/api/leads` é o único ponto de entrada, aplicando validações, Turnstile quando configurado e rate limit antes de usar `SUPABASE_LEADS_INSERT_KEY` ou o fallback server-side `SUPABASE_SERVICE_ROLE_KEY` no backend.

## Testes manuais de segurança

Antes de publicar, confirme:

- `POST /api/leads` sem `Origin` em produção retorna `403`;
- `POST /api/leads` com `cf-turnstile-response` inválido retorna `400` quando `REQUIRE_TURNSTILE=1` ou as chaves Turnstile estão configuradas;
- `POST /api/leads` sem `consent: true` retorna `422`;
- mais de 5 `POST /api/leads` em 10 minutos para o mesmo IP retorna `429`;
- o HTML servido não contém chaves Supabase nem segredos;
- `/.well-known/security.txt` responde com contato e expiração futura;
- a CSP não permite Google Fonts e permite Cloudflare Turnstile em `script-src`, `frame-src` e `connect-src`.

## Limite conhecido

Este projeto atualmente é uma landing page de captação de leads. Ele ainda não implementa uma consulta real de código de rastreamento com status e histórico. Para adicionar esse fluxo com segurança, primeiro é necessário definir a fonte dos dados de rastreamento: API externa, tabela no Supabase, painel administrativo ou outro sistema operacional.

## Checklist antes de publicar mudanças

- revisar textos, telefones e links de contato;
- validar o formulário no navegador;
- rodar `node scripts/validate-runtime-env.js` para staging/producao;
- testar o envio real de lead ate o Supabase com `node scripts/smoke-supabase-lead.js --confirm-write`;
- validar o deploy real com `node scripts/smoke-deploy.js --url=https://cdcentralrastreamento.com.br`;
- verificar responsividade em mobile, tablet e desktop;
- revisar páginas legais:
  [public/politica-de-privacidade.html](./public/politica-de-privacidade.html)
  e
  [public/termos-de-uso.html](./public/termos-de-uso.html);
- confirmar se logos e imagens continuam corretos.

## Manutenção rápida

### Para trocar WhatsApp

Procure por `wa.me` em [public/index.html](./public/index.html).

### Para trocar Instagram

Procure por `instagram.com/cdcentral.br` em [public/index.html](./public/index.html).

### Para trocar e-mail

Procure por `mailto:` em [public/index.html](./public/index.html).

### Para trocar o fundo visual

O fundo é composto por:

- gradientes aplicados no `body`;
- elementos `.site-bg`, `.orb--left`, `.orb--right` e `.scan-lines` em [public/assets/css/styles.css](./public/assets/css/styles.css).

## Observações

- O projeto não usa framework frontend.
- O servidor principal é [server.js](./server.js).
- O backend depende de `fetch` disponível no runtime, por isso Node 20+ é o alvo recomendado.
- A documentação deve ser atualizada sempre que houver mudança de campos, links, estrutura ou fluxo de deploy.
