"use strict";

const MAX_FIELD_LENGTH = 120;
const normalizeString = (value) => {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_FIELD_LENGTH);
};

const normalizeComparableString = (value) =>
  normalizeString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizeLead = (payload) => {
  return {
    nome: normalizeString(payload.nome),
    whatsapp: normalizeString(payload.whatsapp),
    tipo: normalizeString(payload.tipo),
    veiculos: normalizeString(payload.veiculos),
  };
};

const validateLead = (lead) => {
  const errors = [];
  const phoneDigits = lead.whatsapp.replace(/\D/g, "");
  const vehicles = Number(lead.veiculos);
  const normalizedType = normalizeComparableString(lead.tipo);

  if (!lead.nome || lead.nome.length < 3) {
    errors.push("nome");
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 11) {
    errors.push("whatsapp");
  }
  if (!lead.tipo) {
    errors.push("tipo");
  }
  if (lead.tipo && !(normalizedType.startsWith("pessoa") || normalizedType.startsWith("empresa"))) {
    errors.push("tipo");
  }
  if (!Number.isFinite(vehicles) || vehicles < 1) {
    errors.push("veiculos");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const table = process.env.SUPABASE_LEADS_TABLE || "leads";

  if (!url || !key) {
    throw new Error("Configuração do Supabase ausente.");
  }

  return { url, key, table };
};

const saveLeadToSupabase = async (lead) => {
  if (typeof fetch !== "function") {
    throw new Error("Runtime sem suporte a fetch.");
  }

  const config = getSupabaseConfig();
  const endpoint = `${config.url.replace(/\/$/, "")}/rest/v1/${encodeURIComponent(config.table)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify([lead]),
  });

  if (!response.ok) {
    const details = await response.text();
    const message = details || "Falha ao salvar lead.";
    throw new Error(message.slice(0, 350));
  }
};

module.exports = {
  normalizeLead,
  validateLead,
  saveLeadToSupabase,
};
