#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  RELEASE_COMMANDS,
  ReleaseGateError,
  formatCommand,
  inspectRepositoryPreflight,
  npmExecutable,
  npmInvocation,
  runChildCommand,
  runCommandSequence,
  verifyGeneratedCleanliness,
  verifyProtectedContracts,
} from "../lib/release-quality-gate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const allowDirty = process.argv.includes("--allow-dirty");
const npm = npmExecutable();
const npmProcess = npmInvocation();
const gateStarted = performance.now();
const summaries = [];
let preflight;

try {
  preflight = await runInternalStage("Repository preflight", () => inspectRepositoryPreflight(root, { allowDirty }));

  await runCommandSequence(RELEASE_COMMANDS, async (definition) => {
    const started = performance.now();
    const printable = formatCommand(npm, definition.args);
    process.stdout.write(`\n[release-gate] START ${definition.name}\n[release-gate] COMMAND ${printable}\n`);
    const result = await runChildCommand({
      executable: npmProcess.executable,
      args: [...npmProcess.argsPrefix, ...definition.args],
      cwd: root,
    });
    const elapsedMs = performance.now() - started;
    process.stdout.write(`[release-gate] END ${definition.name} exit=${result.code} elapsed=${formatDuration(elapsedMs)}${definition.required ? "" : " diagnostic=true"}\n`);
    return { code: result.code, signal: result.signal, elapsedMs };
  }, {
    onResult: ({ definition, elapsedMs, code }) => summaries.push({
      name: definition.name,
      elapsedMs,
      code,
      required: definition.required,
    }),
  });

  const protectedResult = await runInternalStage("Protected contracts", () => verifyProtectedContracts(root));
  await runInternalStage("Generated-output cleanliness", () => verifyGeneratedCleanliness(
    root,
    preflight.initialStatus,
    { allowDirty },
  ));

  const totalMs = performance.now() - gateStarted;
  process.stdout.write("\n[release-gate] SUMMARY\n");
  for (const entry of summaries) {
    process.stdout.write(`[release-gate] ${entry.required ? "required" : "diagnostic"} ${entry.name}: exit=${entry.code} elapsed=${formatDuration(entry.elapsedMs)}\n`);
  }
  process.stdout.write(`[release-gate] protected printables=${protectedResult.printableCount} hash=${protectedResult.protectedHash}\n`);
  process.stdout.write(`[release-gate] static outputs=${protectedResult.staticOutputCount} defaultPdfBytes=${protectedResult.defaultPdfBytes}\n`);
  process.stdout.write(`[release-gate] PASS total=${formatDuration(totalMs)}\n`);
} catch (error) {
  const normalized = error instanceof ReleaseGateError
    ? error
    : new ReleaseGateError(error instanceof Error ? error.message : String(error));
  process.stderr.write(`\n[release-gate] FAIL ${normalized.message}\n`);
  for (const detail of normalized.details || []) process.stderr.write(`[release-gate] ${detail}\n`);
  process.stderr.write(`[release-gate] total=${formatDuration(performance.now() - gateStarted)}\n`);
  process.exitCode = normalized.exitCode;
}

async function runInternalStage(name, callback) {
  const started = performance.now();
  process.stdout.write(`\n[release-gate] START ${name}\n`);
  const value = await callback();
  const elapsedMs = performance.now() - started;
  summaries.push({ name, elapsedMs, code: 0, required: true });
  process.stdout.write(`[release-gate] END ${name} exit=0 elapsed=${formatDuration(elapsedMs)}\n`);
  return value;
}

function formatDuration(milliseconds) {
  return `${(milliseconds / 1000).toFixed(3)}s`;
}
