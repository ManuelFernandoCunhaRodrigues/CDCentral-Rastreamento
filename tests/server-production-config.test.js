"use strict";

process.env.NODE_ENV = "production";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
process.env.REQUIRE_TURNSTILE = "1";
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION;

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAppServer } = require("../server");

test("server falha boot em producao sem Turnstile e Upstash", () => {
  assert.throws(
    () => createAppServer(),
    (error) =>
      error instanceof Error &&
      /Production security config invalid/.test(error.message) &&
      /TURNSTILE_SITE_KEY/.test(error.message) &&
      /TURNSTILE_SECRET_KEY/.test(error.message) &&
      /UPSTASH_REDIS_REST_URL/.test(error.message) &&
      /UPSTASH_REDIS_REST_TOKEN/.test(error.message)
  );
});
