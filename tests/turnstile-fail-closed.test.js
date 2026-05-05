"use strict";

process.env.NODE_ENV = "test";
process.env.CONSENT_VERSION = "2026-04-28";
process.env.REQUIRE_TURNSTILE = "1";
process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "0";
process.env.ALLOW_LOCAL_ORIGINS = "1";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
process.env.SUPABASE_LEADS_TABLE = "leads";
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createAppServer } = require("../server");

const originalFetch = global.fetch;
let server;
let port;
let fetchCalls = 0;

const request = ({ method = "GET", path = "/", headers = {}, body = "" }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          Host: `127.0.0.1:${port}`,
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
    if (body) {
      req.write(body);
    }
    req.end();
  });

test.before(async () => {
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 201,
      statusText: "Created",
      text: async () => "",
      json: async () => ({ success: true, hostname: "cdcentralrastreamento.com.br" }),
    };
  };

  server = createAppServer();
  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  global.fetch = originalFetch;
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(() => {
  fetchCalls = 0;
});

test("public-config nao exige Turnstile quando variavel antiga esta ativa", async () => {
  const response = await request({ path: "/api/public-config" });

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).turnstileEnabled, false);
});

test("api de leads aceita envio sem token de Turnstile", async () => {
  const response = await request({
    method: "POST",
    path: "/api/leads",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify({
      nome: "Maria Silva",
      whatsapp: "(98) 98757-7275",
      tipo: "Pessoa fisica",
      veiculos: "2",
      empresa: "",
      startedAt: String(Date.now() - 2000),
      consent: true,
      consentVersion: "2026-04-28",
    }),
  });

  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).message, "Lead recebido com sucesso.");
  assert.equal(fetchCalls, 1);
});
