"use strict";

process.env.NODE_ENV = "production";
process.env.SITE_URL = "https://cdcentralrastreamento.com.br";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.ALLOW_MEMORY_RATE_LIMIT_IN_PRODUCTION;

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAppServer } = require("../server");

test("server permite producao sem Upstash quando rate limit externo nao e obrigatorio", () => {
  assert.doesNotThrow(() => createAppServer());
});

test("server exige Upstash quando rate limit externo e obrigatorio", () => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";

  try {
    assert.throws(
      () => createAppServer(),
      (error) =>
        error instanceof Error &&
        /Production security config invalid/.test(error.message) &&
        /UPSTASH_REDIS_REST_URL/.test(error.message) &&
        /UPSTASH_REDIS_REST_TOKEN/.test(error.message)
    );
  } finally {
    delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
  }
});

test("server rejeita SUPABASE_SERVICE_ROLE_KEY como fallback em producao", () => {
  process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "upstash-token-test";
  process.env.REQUIRE_EXTERNAL_RATE_LIMIT = "1";
  delete process.env.SUPABASE_LEADS_INSERT_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_service_role_test_key";

  try {
    assert.throws(
      () => createAppServer(),
      (error) =>
        error instanceof Error &&
        /Production security config invalid/.test(error.message) &&
        /SUPABASE_LEADS_INSERT_KEY/.test(error.message) &&
        /SUPABASE_SERVICE_ROLE_KEY is not accepted/.test(error.message)
    );
  } finally {
    process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.REQUIRE_EXTERNAL_RATE_LIMIT;
  }
});

test("server rejeita SUPABASE_LEADS_INSERT_KEY publishable em producao", () => {
  process.env.SUPABASE_LEADS_INSERT_KEY = "sb_publishable_unsafe_key";

  try {
    assert.throws(
      () => createAppServer(),
      (error) =>
        error instanceof Error &&
        /Production security config invalid/.test(error.message) &&
        /SUPABASE_LEADS_INSERT_KEY must be a server-side key/.test(error.message)
    );
  } finally {
    process.env.SUPABASE_LEADS_INSERT_KEY = "sb_secret_test_key";
  }
});
