"use strict";

process.env.NODE_ENV = "test";
process.env.CONSENT_VERSION = "2026-04-28";
process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "0";
process.env.ALLOW_LOCAL_ORIGINS = "1";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
process.env.SUPABASE_LEADS_TABLE = "leads";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { createAppServer } = require("../server");

const originalFetch = global.fetch;
let server;
let port;
let fetchCalls = [];

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

const postLead = (payload) =>
  request({
    method: "POST",
    path: "/api/leads",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3000",
    },
    body: JSON.stringify(payload),
  });

test.before(async () => {
  global.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 201,
      statusText: "Created",
      text: async () => "",
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
  fetchCalls = [];
});

test("serve pagina principal e bloqueia arquivo fora da lista publica", async () => {
  const home = await request({ path: "/" });
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /<title>CDCentral Rastreamento/);
  assert.match(home.headers["content-security-policy"], /default-src 'self'/);

  const hiddenFile = await request({ path: "/server.js" });
  assert.equal(hiddenFile.statusCode, 404);
});

test("health publico expoe somente status", async () => {
  const response = await request({ path: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { status: "ok" });
});

test("entrega configuracao publica com versao de consentimento", async () => {
  const response = await request({ path: "/api/public-config" });
  assert.equal(response.statusCode, 200);

  const config = JSON.parse(response.body);
  assert.equal(config.consentVersion, "2026-04-28");
});

test("valida campos obrigatorios de lead antes de gravar", async () => {
  const response = await postLead({
    nome: "A",
    whatsapp: "123",
    tipo: "",
    veiculos: "0",
    startedAt: String(Date.now() - 2000),
    consent: false,
    consentVersion: "2026-04-28",
  });

  assert.equal(response.statusCode, 422);
  assert.deepEqual(JSON.parse(response.body).fields, ["nome", "whatsapp", "tipo", "veiculos", "consent"]);
  assert.equal(fetchCalls.length, 0);
});

test("grava lead valido com dados normalizados", async () => {
  const response = await postLead({
    nome: "  Maria   Silva ",
    whatsapp: "(98) 98757-7275",
    tipo: "Pessoa fisica",
    veiculos: "2",
    empresa: "",
    startedAt: String(Date.now() - 2000),
    consent: true,
    consentVersion: "2026-04-28",
  });

  assert.equal(response.statusCode, 201);
  assert.equal(fetchCalls.length, 1);

  const insertedRows = JSON.parse(fetchCalls[0].options.body);
  assert.equal(insertedRows[0].nome, "Maria Silva");
  assert.equal(insertedRows[0].whatsapp, "98987577275");
  assert.equal(insertedRows[0].tipo, "Pessoa fisica");
  assert.equal(insertedRows[0].veiculos, 2);
  assert.equal(insertedRows[0].consent_ip, "127.0.0.0");
});
