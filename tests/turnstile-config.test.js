"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { getTurnstileConfig, isTurnstileFailClosed } = require("../lib/turnstile-config");

const originalEnv = { ...process.env };

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("Turnstile e obrigatorio por padrao em producao", () => {
  process.env.NODE_ENV = "production";
  delete process.env.VERCEL;
  delete process.env.REQUIRE_TURNSTILE;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.TURNSTILE_SECRET_KEY;

  const config = getTurnstileConfig();

  assert.equal(config.required, true);
  assert.deepEqual(config.missing, ["TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]);
  assert.equal(isTurnstileFailClosed(config), true);
});

test("Turnstile nao pode ser desligado em runtime de producao", () => {
  process.env.NODE_ENV = "production";
  process.env.REQUIRE_TURNSTILE = "0";
  process.env.TURNSTILE_SITE_KEY = "site-key-test";
  process.env.TURNSTILE_SECRET_KEY = "secret-key-test";

  const config = getTurnstileConfig();

  assert.equal(config.disabledInProduction, true);
  assert.equal(isTurnstileFailClosed(config), true);
});
