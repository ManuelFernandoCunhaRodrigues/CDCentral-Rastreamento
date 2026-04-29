"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");

const parseArgs = (argv = process.argv.slice(2)) => {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }

    const separatorIndex = arg.indexOf("=");
    if (separatorIndex !== -1) {
      args[arg.slice(2, separatorIndex)] = arg.slice(separatorIndex + 1);
      continue;
    }

    const key = arg.slice(2);
    const nextArg = argv[index + 1];
    if (nextArg && !nextArg.startsWith("--")) {
      args[key] = nextArg;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
};

const resolveRootPath = (value) => {
  return path.isAbsolute(value) ? value : path.join(root, value);
};

const loadEnvFile = (filename, options = {}) => {
  const override = options.override === true;
  const optional = options.optional !== false;
  const filePath = resolveRootPath(filename);

  if (!fs.existsSync(filePath)) {
    if (!optional) {
      throw new Error(`Env file not found: ${filePath}`);
    }
    return false;
  }

  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && (override || process.env[key] === undefined)) {
      process.env[key] = value;
    }
  });

  return true;
};

const loadEnvFiles = (args = {}) => {
  loadEnvFile(".env", { optional: true });

  const envFile = args.env || args["env-file"];
  if (envFile) {
    loadEnvFile(envFile, { override: true, optional: false });
    return envFile;
  }

  loadEnvFile(".env.local", { optional: true });
  return ".env.local";
};

const getFirstEnv = (names) => {
  for (const name of names) {
    const value = process.env[name];
    if (String(value || "").trim()) {
      return { name, value: String(value).trim() };
    }
  }

  return { name: names[0], value: "" };
};

const normalizeOrigin = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const parsedUrl = new URL(rawValue);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (error) {
    return "";
  }
};

const parseOriginList = (value) => {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
};

const hasPlaceholderValue = (value) => {
  const normalizedValue = String(value || "").trim().toLowerCase();
  return (
    !normalizedValue ||
    normalizedValue.includes("your_") ||
    normalizedValue.includes("your-") ||
    normalizedValue.includes("seudominio") ||
    normalizedValue.includes("example.") ||
    normalizedValue.includes("changeme") ||
    normalizedValue === "token" ||
    normalizedValue === "secret" ||
    normalizedValue === "key"
  );
};

const redact = (value) => {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "(missing)";
  }

  if (normalizedValue.length <= 8) {
    return "***";
  }

  return `${normalizedValue.slice(0, 4)}...${normalizedValue.slice(-4)}`;
};

module.exports = {
  getFirstEnv,
  hasPlaceholderValue,
  loadEnvFiles,
  normalizeOrigin,
  parseArgs,
  parseOriginList,
  redact,
  resolveRootPath,
  root,
};
