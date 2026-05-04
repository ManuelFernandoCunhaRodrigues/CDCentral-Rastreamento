# Deploy em VPS com Node.js, PM2, Nginx e SSL

Este guia cobre uma VPS Ubuntu. Ajuste usuario, dominio e caminhos conforme seu servidor.

## 1. Instalar Node.js LTS

Exemplo com NodeSource para Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

O projeto exige Node.js 20 ou superior.

## 2. Obter o projeto

Via Git:

```bash
cd /var/www
sudo git clone https://github.com/sua-conta/seu-repo.git cdcentral-rastreamento
sudo chown -R "$USER":"$USER" /var/www/cdcentral-rastreamento
cd /var/www/cdcentral-rastreamento
```

Ou envie um ZIP sem arquivos sensiveis e extraia em `/var/www/cdcentral-rastreamento`.

Nao envie:

```text
.env.local
.git/ se usar ZIP
.claude/
node_modules/
logs/
*.log
*.tmp
```

## 3. Instalar dependencias

```bash
npm install --omit=dev
```

## 4. Criar variaveis de ambiente

Crie o `.env` somente no servidor:

```bash
nano .env
```

Conteudo:

```env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TRUST_PROXY_HEADERS=1
ALLOW_LOCAL_ORIGINS=0
REQUIRE_REQUEST_ORIGIN=1
CONSENT_VERSION=2026-04-28
SITE_URL=https://cdcentralrastreamento.com.br
ALLOWED_ORIGINS=https://cdcentralrastreamento.com.br
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_LEADS_INSERT_KEY=your_server_side_insert_key
ALLOW_SUPABASE_SERVICE_ROLE_KEY_FALLBACK=0
SUPABASE_LEADS_TABLE=leads
REQUIRE_TURNSTILE=0
TURNSTILE_SITE_KEY=your_public_turnstile_site_key
TURNSTILE_SECRET_KEY=your_private_turnstile_secret_key
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
REQUIRE_EXTERNAL_RATE_LIMIT=0
ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION=0
```

`CONSENT_VERSION` representa a fonte operacional da versao de consentimento enviada por `/api/public-config` e validada em `/api/leads`. Ao atualizar a Politica de Privacidade, altere essa variavel no `.env` da VPS e reinicie o PM2.

`SUPABASE_SERVICE_ROLE_KEY` nao e usado como fallback implicito. Se voce decidir usar esse nome em vez de `SUPABASE_LEADS_INSERT_KEY`, configure `ALLOW_SUPABASE_SERVICE_ROLE_KEY_FALLBACK=1` conscientemente.

Proteja o arquivo:

```bash
chmod 600 .env
```

## 5. Testar sem PM2

```bash
npm start
```

Em outro terminal:

```bash
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/api/public-config
```

Pare com `Ctrl+C`.

Em VPS com Nginx, mantenha `HOST=127.0.0.1`. Isso impede que o app Node fique acessivel diretamente pela internet na porta 3000. Para Hostinger Node.js Web App, use `HOST=0.0.0.0`.

## 6. Rodar com PM2

Instale PM2:

```bash
sudo npm install -g pm2
```

Inicie:

```bash
mkdir -p logs
pm2 start config/pm2/ecosystem.config.cjs
pm2 status
pm2 logs cdcentral-rastreamento
```

Salvar para iniciar no boot:

```bash
pm2 save
pm2 startup
```

O comando `pm2 startup` imprime um comando com `sudo`. Execute exatamente o comando exibido.

Comandos uteis:

```bash
pm2 restart cdcentral-rastreamento
pm2 stop cdcentral-rastreamento
pm2 logs cdcentral-rastreamento --lines 100
```

## 7. Configurar Nginx como reverse proxy

Instale Nginx:

```bash
sudo apt-get install -y nginx
```

Crie a config:

```bash
sudo nano /etc/nginx/sites-available/cdcentral-rastreamento
```

Conteudo:

```nginx
server {
    listen 80;
    server_name cdcentralrastreamento.com.br www.cdcentralrastreamento.com.br;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Ative:

```bash
sudo ln -s /etc/nginx/sites-available/cdcentral-rastreamento /etc/nginx/sites-enabled/cdcentral-rastreamento
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Configurar firewall

Mantenha somente HTTP, HTTPS e SSH expostos publicamente. A porta interna do Node.js (`3000`) deve ficar fechada para a internet quando `HOST=127.0.0.1`.

Exemplo com UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Nao abra `3000/tcp` publicamente. O Nginx acessa `http://127.0.0.1:3000` localmente.

## 9. Ativar SSL com Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cdcentralrastreamento.com.br -d www.cdcentralrastreamento.com.br
sudo certbot renew --dry-run
```

Depois do SSL, confira que `.env` usa `SITE_URL=https://cdcentralrastreamento.com.br`.

## 10. Testar producao

```bash
curl -i https://cdcentralrastreamento.com.br/health
curl -i https://cdcentralrastreamento.com.br/api/public-config
curl -I https://cdcentralrastreamento.com.br/
curl -I https://cdcentralrastreamento.com.br/assets/css/styles.css
curl -I https://cdcentralrastreamento.com.br/assets/js/script.js
curl -I https://cdcentralrastreamento.com.br/assets/fonts/manrope-latin.woff2
curl -I https://cdcentralrastreamento.com.br/.well-known/security.txt
```

`assets/css/styles.css` e `assets/js/script.js` devem responder com `Cache-Control: no-cache`. Imagens e fontes podem usar cache longo.

Arquivos sensiveis devem retornar 404:

```bash
curl -I https://cdcentralrastreamento.com.br/.env
curl -I https://cdcentralrastreamento.com.br/package.json
curl -I https://cdcentralrastreamento.com.br/package-lock.json
curl -I https://cdcentralrastreamento.com.br/api/leads.js
curl -I https://cdcentralrastreamento.com.br/lib/http-utils.js
curl -I https://cdcentralrastreamento.com.br/database/supabase/leads-schema.sql
```

Teste o formulario no navegador para validar origem, Supabase e rate limit. Se Turnstile estiver habilitado, valide tambem o widget real.

## 11. Verificar logs

Logs da aplicacao:

```bash
pm2 logs cdcentral-rastreamento
tail -f logs/out.log
tail -f logs/error.log
```

Logs do Nginx:

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

Os logs da aplicacao registram metodo, caminho, status, duracao e IP. Eles nao registram tokens, chaves nem payload completo de lead.

## 12. Atualizar deploy

```bash
cd /var/www/cdcentral-rastreamento
git pull
npm install --omit=dev
pm2 restart cdcentral-rastreamento
```

Se alterar o schema, aplique `database/supabase/leads-schema.sql` no Supabase.

## Troubleshooting

502 Bad Gateway:

- Confirme `pm2 status`.
- Confirme que o app escuta `HOST=127.0.0.1` e `PORT=3000`.
- Confirme `proxy_pass http://127.0.0.1:3000`.

500 na API:

- Verifique `.env`.
- Confirme `TURNSTILE_SECRET_KEY`, Supabase e Upstash.
- Se `REQUIRE_EXTERNAL_RATE_LIMIT=1`, `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` sao obrigatorios para `/api/leads`; sem eles o endpoint falha fechado.
- Veja `pm2 logs cdcentral-rastreamento`.

403 em `/api/leads`:

- Em producao, a API exige `Origin` valido.
- Confirme `SITE_URL` e `ALLOWED_ORIGINS`.
- Teste pelo formulario no dominio final.

429:

- O rate limit esta ativo.
- IP: 5 requisicoes por 10 minutos.
- WhatsApp: 3 requisicoes por 24 horas.

Arquivos estaticos nao aparecem:

- Confirme que o arquivo esta na lista publica do `server.js`.
- `api/`, `lib/`, `database/supabase/`, `.env`, logs e arquivos internos sao bloqueados de proposito.
