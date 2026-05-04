"use strict";

process.env.NODE_ENV = "production";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
process.env.ENABLE_CANONICAL_REDIRECT = "1";
process.env.TURNSTILE_SITE_KEY = "site-key-test";
process.env.TURNSTILE_SECRET_KEY = "secret-key-test";
process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
delete process.env.REQUIRE_TURNSTILE;
delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
delete process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION;

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createAppServer, getSecurityHeaders } = require("../server");

let server;
let port;

const request = ({ method = "GET", path = "/", headers = {} }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          Host: "cdcentralrastreamento.com.br",
          ...headers,
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: responseBody });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });

test.before(async () => {
  server = createAppServer();
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("redireciona host nao canonico em producao com robots noarchive", async () => {
  const response = await request({
    path: "/rastreamento?utm=preview",
    headers: {
      Host: "cd-central.vercel.app",
    },
  });

  assert.equal(response.statusCode, 301);
  assert.equal(response.headers.location, "https://cdcentralrastreamento.com.br/rastreamento?utm=preview");
  assert.equal(response.headers["x-robots-tag"], "noindex, nofollow, noarchive");
  assert.equal(response.headers["cache-control"], "no-store");
});

test("serve headers de seguranca fortes no host canonico em producao", async () => {
  const response = await request({ path: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["permissions-policy"], /payment=\(\)/);
  assert.match(response.headers["permissions-policy"], /interest-cohort=\(\)/);
  assert.equal(response.headers["reporting-endpoints"], 'default="/api/csp-report"');
  assert.equal(JSON.parse(response.headers["report-to"]).endpoints[0].url, "/api/csp-report");
  assert.equal(response.headers["cross-origin-embedder-policy"], "require-corp");
  assert.equal(response.headers["strict-transport-security"], "max-age=63072000; includeSubDomains; preload");
});

test("getSecurityHeaders usa endpoints de relatorio relativos", () => {
  const headers = getSecurityHeaders({
    headers: {
      host: "cdcentralrastreamento.com.br",
    },
  });

  assert.equal(headers["Reporting-Endpoints"], 'default="/api/csp-report"');
  assert.deepEqual(JSON.parse(headers["Report-To"]), {
    group: "default",
    max_age: 10886400,
    endpoints: [{ url: "/api/csp-report" }],
    include_subdomains: false,
  });
  assert.match(headers["Content-Security-Policy-Report-Only"], /report-uri \/api\/csp-report/);
});

test("pagina legal HTML servida pelo Node recebe X-Frame-Options DENY", async () => {
  const response = await request({ path: "/politica-de-privacidade.html" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.match(response.headers["content-type"], /^text\/html/);
});
