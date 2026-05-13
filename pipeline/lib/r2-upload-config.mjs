import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const EXPECTED_R2_BUCKET = "i-love-coloring-page";
export const EXPECTED_R2_PREFIX = "coloring-pages";
export const EXPECTED_R2_FILE_COUNT = 12704;
export const DEFAULT_R2_CONCURRENCY = 8;
export const MAX_SAFE_R2_CONCURRENCY = 16;

const LOCAL_ENV_FILE = ".env.r2-upload.local";
const REQUIRED_EXECUTE_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];

export async function buildR2UploadConfig({
  repoRoot = process.cwd(),
  execute = false,
  confirmBucket = "",
  confirmPrefix = "",
  confirmFileCount = 0,
  concurrency,
  allowDangerousBucketOverride = false,
  allowHighConcurrency = false,
  env = process.env,
} = {}) {
  const localEnv = await loadLocalR2Env(repoRoot);
  const mergedEnv = { ...localEnv, ...env };
  const bucket = String(mergedEnv.R2_BUCKET || EXPECTED_R2_BUCKET).trim();
  const prefix = normalizeR2Prefix(mergedEnv.R2_PREFIX || EXPECTED_R2_PREFIX);
  const accountId = String(mergedEnv.R2_ACCOUNT_ID || "").trim();
  const endpoint = String(mergedEnv.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).trim();
  const requestedConcurrency = Number(concurrency || mergedEnv.R2_UPLOAD_CONCURRENCY || DEFAULT_R2_CONCURRENCY);
  const normalizedConcurrency = Number.isFinite(requestedConcurrency) && requestedConcurrency > 0
    ? Math.floor(requestedConcurrency)
    : DEFAULT_R2_CONCURRENCY;

  if (execute) {
    validateExecuteConfirmations({ confirmBucket, confirmPrefix, confirmFileCount });
  }
  validateBucket(bucket, allowDangerousBucketOverride);
  validatePrefix(prefix);
  if (execute) {
    validateCredentials(mergedEnv);
    if (normalizedConcurrency > MAX_SAFE_R2_CONCURRENCY && !allowHighConcurrency) {
      throw new Error(`Refusing execute with concurrency ${normalizedConcurrency}. Use 16 or less.`);
    }
  }

  return {
    bucket,
    prefix,
    endpoint,
    region: "auto",
    accountIdPresent: Boolean(accountId),
    accessKeyIdPresent: Boolean(String(mergedEnv.R2_ACCESS_KEY_ID || "").trim()),
    secretAccessKeyPresent: Boolean(String(mergedEnv.R2_SECRET_ACCESS_KEY || "").trim()),
    credentials: execute
      ? {
          accessKeyId: String(mergedEnv.R2_ACCESS_KEY_ID || "").trim(),
          secretAccessKey: String(mergedEnv.R2_SECRET_ACCESS_KEY || "").trim(),
        }
      : null,
    concurrency: normalizedConcurrency,
    skipExisting: parseBoolean(mergedEnv.R2_UPLOAD_SKIP_EXISTING),
    maxFiles: parsePositiveInteger(mergedEnv.R2_UPLOAD_MAX_FILES),
    maxBytes: parsePositiveInteger(mergedEnv.R2_UPLOAD_MAX_BYTES),
    localEnvFileLoaded: Object.keys(localEnv).length > 0,
    execute,
  };
}

export async function loadLocalR2Env(repoRoot = process.cwd()) {
  const envPath = path.join(repoRoot, LOCAL_ENV_FILE);
  if (!existsSync(envPath)) return {};
  const text = await readFile(envPath, "utf8");
  const parsed = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function validateExecuteConfirmations({ confirmBucket, confirmPrefix, confirmFileCount }) {
  const missing = [];
  if (confirmBucket !== EXPECTED_R2_BUCKET) missing.push(`--confirm-bucket ${EXPECTED_R2_BUCKET}`);
  if (normalizeR2Prefix(confirmPrefix) !== EXPECTED_R2_PREFIX) missing.push(`--confirm-prefix ${EXPECTED_R2_PREFIX}`);
  if (Number(confirmFileCount) !== EXPECTED_R2_FILE_COUNT) missing.push(`--confirm-file-count ${EXPECTED_R2_FILE_COUNT}`);
  if (missing.length) {
    throw new Error(`Execute mode requires exact confirmation flags: ${missing.join(", ")}`);
  }
}

export function validateBucket(bucket, allowDangerousBucketOverride = false) {
  if (bucket !== EXPECTED_R2_BUCKET && !allowDangerousBucketOverride) {
    throw new Error(`Refusing bucket "${bucket}". Expected ${EXPECTED_R2_BUCKET}.`);
  }
}

export function validatePrefix(prefix) {
  if (prefix !== EXPECTED_R2_PREFIX) {
    throw new Error(`Refusing prefix "${prefix}". Expected ${EXPECTED_R2_PREFIX}.`);
  }
  if (prefix.includes("coloring-pages/coloring-pages")) {
    throw new Error("Refusing duplicate coloring-pages/coloring-pages prefix.");
  }
}

export function validateCredentials(env) {
  const missing = REQUIRED_EXECUTE_ENV.filter((key) => !String(env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required execute credentials: ${missing.join(", ")}`);
  }
}

export function normalizeR2Prefix(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

export function redactSecrets(value) {
  return String(value || "")
    .replace(/(R2_SECRET_ACCESS_KEY=)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(R2_ACCESS_KEY_ID=)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(R2_ACCOUNT_ID=)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(Authorization:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_ACCESS_KEY]")
    .replace(/(?<=secretAccessKey["']?\s*[:=]\s*["']?)[^"',\s]+/gi, "[REDACTED]");
}

export function parseBoolean(value) {
  return /^(1|true|yes)$/i.test(String(value || "").trim());
}

export function parsePositiveInteger(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : 0;
}
