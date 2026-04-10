# CDCentral Rastreamento

Site institucional da CDCentral Rastreamento com landing page, formulário de captação de leads e integração com Supabase.

## Visão geral

O projeto é um site estático em HTML, CSS e JavaScript, com um endpoint simples para receber leads em `/api/leads`.

O site foi pensado para:

- apresentar os serviços de rastreamento veicular e gestão de frotas;
- direcionar o usuário para WhatsApp, Instagram, e-mail e mapa;
- captar contatos comerciais pelo formulário;
- salvar os leads em uma tabela do Supabase.

## Stack usada

- HTML estático
- CSS puro
- JavaScript vanilla no frontend
- Node.js para servidor local
- função HTTP em `api/leads.js`
- Supabase como armazenamento dos leads

## Estrutura do projeto

```text
.
|-- index.html
|-- styles.css
|-- script.js
|-- politica-de-privacidade.html
|-- termos-de-uso.html
|-- serve-local.js
|-- api/
|   `-- leads.js
|-- lib/
|   `-- leads-service.js
|-- supabase/
|   `-- leads-schema.sql
|-- assets/
|-- CD CENTRAL IMG/
`-- .env.example
```

## Arquivos principais

- [index.html](./index.html)
  Página principal do site. Contém:
  hero, soluções, benefícios, como funciona, contato, CTA final e rodapé.

- [styles.css](./styles.css)
  Todo o visual do projeto: layout, responsividade, animações, fundo, cards, formulário, menu mobile e footer.

- [script.js](./script.js)
  Controla:
  menu mobile, animação de reveal, ano automático no rodapé, máscara do WhatsApp, validação do formulário e envio para `/api/leads`.

- [serve-local.js](./serve-local.js)
  Servidor local simples para desenvolvimento. Serve os arquivos estáticos e encaminha `/api/leads` para o handler da API.

- [api/leads.js](./api/leads.js)
  Endpoint responsável por validar requisições, aplicar CORS, limitar tentativas e persistir o lead.

- [lib/leads-service.js](./lib/leads-service.js)
  Regras de normalização, validação e envio dos dados para o Supabase.

- [supabase/leads-schema.sql](./supabase/leads-schema.sql)
  Estrutura esperada da tabela de leads.

## Seções da landing page

O conteúdo do site está centralizado em [index.html](./index.html).

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

Edite diretamente [index.html](./index.html).

Exemplos de mudança:

- títulos e textos das seções;
- links de WhatsApp;
- e-mail, Instagram, telefone e mapa;
- textos de botões;
- textos do rodapé.

### Estilo visual

Edite [styles.css](./styles.css).

Os tokens principais ficam no seletor `:root`, como:

- `--bg-main`
- `--bg-soft`
- `--primary`
- `--amber`
- `--text`
- `--muted`

Os breakpoints atuais cuidam de mobile, tablet e desktop.

### Comportamentos do frontend

Edite [script.js](./script.js).

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

O backend também reconhece campos auxiliares de proteção quando presentes:

- `empresa`
- `startedAt`

### Regras de validação

No frontend e backend, o lead precisa ter:

- nome com ao menos 3 caracteres;
- WhatsApp com 10 ou 11 dígitos;
- tipo preenchido;
- quantidade de veículos maior ou igual a 1.

### Proteções existentes

O endpoint possui proteções simples contra abuso:

- validação de origem por CORS;
- limite de tentativas por IP;
- campo honeypot `empresa`;
- verificação de tempo mínimo de preenchimento via `startedAt`.

## Fluxo da API

1. O usuário preenche o formulário na landing page.
2. O frontend envia um `POST` para `/api/leads`.
3. [api/leads.js](./api/leads.js) valida método, origem, payload e limite de requisições.
4. [lib/leads-service.js](./lib/leads-service.js) normaliza os dados e envia para o Supabase.
5. O frontend mostra retorno de sucesso ou erro ao usuário.

## Variáveis de ambiente

Use [`.env.example`](./.env.example) como base.

Exemplo:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_replace_me
SUPABASE_LEADS_TABLE=leads
SITE_URL=https://your-site.com
ALLOWED_ORIGINS=https://your-site.com,https://your-preview.vercel.app
```

### Descrição das variáveis

- `SUPABASE_URL`
  URL do projeto no Supabase.

- `SUPABASE_SERVICE_ROLE_KEY`
  Chave usada para inserir leads via API.

- `SUPABASE_LEADS_TABLE`
  Nome da tabela onde os leads serão salvos.

- `SITE_URL`
  URL principal do site em produção.

- `ALLOWED_ORIGINS`
  Lista de origens extras liberadas no CORS, separadas por vírgula.

## Como rodar localmente

Pré-requisito recomendado:

- Node.js 18 ou superior

### Passos

1. Crie um `.env.local` com base no `.env.example`.
2. Preencha as credenciais do Supabase.
3. Inicie o servidor local:

```powershell
node serve-local.js
```

4. Acesse:

```text
http://127.0.0.1:4173
```

## Publicação

O projeto pode ser publicado como site estático com suporte à rota `/api/leads`.

Pontos importantes na publicação:

- configurar corretamente as variáveis de ambiente;
- garantir que o domínio final esteja em `SITE_URL`;
- liberar previews e ambientes auxiliares em `ALLOWED_ORIGINS`;
- validar se a tabela do Supabase existe e aceita os campos esperados.

## Checklist antes de publicar mudanças

- revisar textos, telefones e links de contato;
- validar o formulário no navegador;
- testar o envio de lead até o Supabase;
- verificar responsividade em mobile, tablet e desktop;
- revisar páginas legais:
  [politica-de-privacidade.html](./politica-de-privacidade.html)
  e
  [termos-de-uso.html](./termos-de-uso.html);
- confirmar se logos e imagens continuam corretos.

## Manutenção rápida

### Para trocar WhatsApp

Procure por `wa.me` em [index.html](./index.html).

### Para trocar Instagram

Procure por `instagram.com/cdcentral.br` em [index.html](./index.html).

### Para trocar e-mail

Procure por `mailto:` em [index.html](./index.html).

### Para trocar o fundo visual

O fundo é composto por:

- gradientes aplicados no `body`;
- elementos `.site-bg`, `.orb--left`, `.orb--right` e `.scan-lines` em [styles.css](./styles.css).

Também existe um PNG exportado do fundo em:

- [assets/background-cdcentral.png](./assets/background-cdcentral.png)

## Observações

- O projeto não usa framework frontend.
- O servidor local é propositalmente simples.
- O backend depende de `fetch` disponível no runtime, por isso Node 18+ é o mais indicado.
- A documentação deve ser atualizada sempre que houver mudança de campos, links, estrutura ou fluxo de deploy.
