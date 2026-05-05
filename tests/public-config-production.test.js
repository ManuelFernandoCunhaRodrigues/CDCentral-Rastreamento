"use strict";

process.env.NODE_ENV = "production";
process.env.VERCEL = "1";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
delete process.env.REQUIRE_TURNSTILE;

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

test("public-config permite producao sem Turnstile configurado", async () => {
  const response = createResponse();

  await publicConfigHandler({ method: "GET", headers: {} }, response);

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.turnstileEnabled, false);
  assert.equal(body.turnstileSiteKey, "");
});

test("public-config ignora Turnstile parcial quando nao e obrigatorio", async () => {
  process.env.TURNSTILE_SITE_KEY = "site-key-test";
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.REQUIRE_TURNSTILE;
  const response = createResponse();

  await publicConfigHandler({ method: "GET", headers: {} }, response);

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.turnstileEnabled, false);
  assert.equal(body.turnstileSiteKey, "");
});

test("public-config mantem Turnstile desabilitado mesmo com configuracao completa", async () => {
  process.env.REQUIRE_TURNSTILE = "1";
  process.env.TURNSTILE_SITE_KEY = "site-key-test";
  process.env.TURNSTILE_SECRET_KEY = "secret-key-test";
  const response = createResponse();

  await publicConfigHandler({ method: "GET", headers: {} }, response);

  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.turnstileEnabled, false);
  assert.equal(body.turnstileSiteKey, "");
});
