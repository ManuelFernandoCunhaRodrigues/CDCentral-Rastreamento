"use strict";

const { getConsentVersion } = require("../lib/app-config");
const { saveLeadToSupabase } = require("../lib/leads-service");
const { loadEnvFiles, parseArgs } = require("./lib/env");

const args = parseArgs();
if (!args.env && !args["env-file"] && String(args._[0] || "").includes(".env")) {
  args.env = args._[0];
}
if (!args.target && args._[1]) {
  args.target = args._[1];
}

try {
  loadEnvFiles(args);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const hasWriteConfirmation = args["confirm-write"] === true || process.env.SMOKE_SUPABASE_CONFIRM === "write";

if (!hasWriteConfirmation) {
  console.error(
    "This smoke test inserts a real lead row. Re-run with --confirm-write or SMOKE_SUPABASE_CONFIRM=write."
  );
  process.exit(2);
}

const target = String(args.target || process.env.VERCEL_ENV || process.env.NODE_ENV || "local-env").toLowerCase();
const timestamp = new Date().toISOString();
const phoneSuffix = String(Date.now()).slice(-6).padStart(6, "0");
const lead = {
  nome: `[SMOKE] CDCentral ${target} ${timestamp}`,
  whatsapp: String(args.phone || `11999${phoneSuffix}`).replace(/\D/g, "").slice(0, 11),
  tipo: "Pessoa fisica",
  veiculos: 1,
  consent_at: timestamp,
  consent_version: getConsentVersion(),
  consent_ip: "smoke-test",
};

(async () => {
  await saveLeadToSupabase(lead);

  console.log("Supabase smoke insert OK.");
  console.log(`target=${target}`);
  console.log(`table=${process.env.SUPABASE_LEADS_TABLE || "leads"}`);
  console.log(`lead=${lead.nome}`);
})();
