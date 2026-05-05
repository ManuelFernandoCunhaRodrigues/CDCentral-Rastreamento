"use strict";

process.env.NODE_ENV = "production";
process.env.VERCEL = "1";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";

const assert = require("node:assert/strict");
const test = require("node:test");
const publicConfigHandler = require("../api/public-config");

const createResponse = () => ({
  headers: {},
  statusCode: 0,
  body: "",
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  end(body = "") {
    this.body = String(body || "");
  },
});

test("public-config retorna apenas a versao de consentimento", async () => {
  const response = createResponse();

  await publicConfigHandler({ method: "GET", headers: {} }, response);

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(body.consentVersion));
  assert.equal(body.turnstileEnabled, undefined);
  assert.equal(body.turnstileSiteKey, undefined);
});

test("public-config rejeita metodo nao GET", async () => {
  const response = createResponse();

  await publicConfigHandler({ method: "POST", headers: {} }, response);

  assert.equal(response.statusCode, 405);
});
