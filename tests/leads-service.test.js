"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { LeadStorageError, normalizeLead, saveLeadToSupabase, validateLead } = require("../lib/leads-service");

const originalEnv = { ...process.env };

const resetEnv = () => {
  process.env = { ...originalEnv };
};

const createJwtWithRole = (role) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ role })}.signature`;
};

test.afterEach(resetEnv);

test("normaliza e valida um lead aceito pelo backend", () => {
  const lead = normalizeLead({
    nome: "  Maria   Silva  ",
    whatsapp: "(98) 98757-7275",
    tipo: "Pessoa física",
    veiculos: "3",
  });

  assert.deepEqual(lead, {
    nome: "Maria Silva",
    whatsapp: "98987577275",
    tipo: "Pessoa fisica",
    veiculos: 3,
  });
  assert.deepEqual(validateLead(lead), { valid: true, errors: [] });
});

test("rejeita campos invalidos e quantidades fora do intervalo", () => {
  const validation = validateLead(
    normalizeLead({
      nome: "A",
      whatsapp: "123",
      tipo: "Outro",
      veiculos: "10000",
    })
  );

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.errors, ["nome", "whatsapp", "tipo", "veiculos"]);
});

test("bloqueia chave publica do Supabase em gravacao server-side", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_LEADS_INSERT_KEY = createJwtWithRole("anon");
  process.env.SUPABASE_LEADS_TABLE = "leads";

  await assert.rejects(
    () =>
      saveLeadToSupabase({
        nome: "Maria Silva",
        whatsapp: "98987577275",
        tipo: "Pessoa fisica",
        veiculos: 1,
        consent_at: new Date().toISOString(),
        consent_version: "2026-04-28",
        consent_ip: "127.0.0.1",
      }),
    (error) => error instanceof LeadStorageError && error.code === "unsafe_supabase_key"
  );
});
