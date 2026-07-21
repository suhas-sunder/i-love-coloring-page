#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNTIME_PATH = "src/generated/coloring/runtime-printables.json";
const DECISIONS_PATH = "pipeline/manifests/metadata-review-decisions.json";
const OUTPUTS = {
  status: "reports/metadata-review-status.md",
  candidates: "reports/metadata-candidate-disposition.csv",
  batches: "reports/metadata-review-batches.md",
  sampling: "reports/metadata-review-sampling.md",
  localData: "pipeline/review/metadata-review/candidates.json",
  localUi: "pipeline/review/metadata-review/index.html",
};
const FIELDS = ["detailClassification", "audienceClassification"];
const ACTIONS = new Set(["approve", "reject", "correct", "skip"]);

async function main() {
  const importPath = readImportPath(process.argv.slice(2));
  const runtime = await readJson(RUNTIME_PATH);
  const manifest = await readJson(DECISIONS_PATH);
  validateManifest(manifest);
  if (importPath) await importDecisions(manifest, importPath, runtime.records);

  const candidates = buildCandidates(runtime.records, manifest);
  await writeJson(DECISIONS_PATH, manifest);
  await writeText(OUTPUTS.status, renderStatus(runtime.records, candidates));
  await writeText(OUTPUTS.candidates, renderCsv(candidates));
  await writeText(OUTPUTS.batches, renderBatches(candidates));
  await writeText(OUTPUTS.sampling, renderSampling(candidates));
  await writeJson(OUTPUTS.localData, { generatedAt: runtime.generatedAt, candidates });
  await writeText(OUTPUTS.localUi, renderReviewUi());
  process.stdout.write(`Metadata review workflow generated ${candidates.length} candidate fields for ${new Set(candidates.map((candidate) => candidate.assetId)).size} printable routes.\n`);
}

function buildCandidates(records, manifest) {
  const decisions = new Map(manifest.decisions.map((decision) => [`${decision.assetId}:${decision.field}`, decision]));
  return records.flatMap((record) => {
    const attributes = record.attributes || {};
    return [
      ...candidateRows(record, "detailClassification", attributes.unapprovedDetailCandidates || [], "B. RULE-BASED REVIEWABLE", "Collection membership can suggest a detail label but does not establish it as public metadata."),
      ...candidateRows(record, "audienceClassification", attributes.unapprovedAudienceCandidates || [], "C. VISUAL OR EDITORIAL REVIEW REQUIRED", "Collection membership does not establish an age or audience claim; editorial and policy review is required."),
    ].map((candidate) => ({ ...candidate, decision: decisions.get(`${candidate.assetId}:${candidate.field}`) || null }));
  }).sort((left, right) => left.assetId.localeCompare(right.assetId) || left.field.localeCompare(right.field));
}

function candidateRows(record, field, values, state, rationale) {
  if (!values.length) return [];
  return [{
    assetId: record.assetId,
    route: record.canonicalPath,
    title: record.displayTitle,
    primaryHubId: record.primaryHubId,
    previewPath: record.webpPath,
    field,
    candidateValue: values.join(" | "),
    candidateValues: values,
    state,
    confidence: state.startsWith("B.") ? "reviewable rule candidate" : "manual editorial judgment required",
    provenance: "explicit_collection_assignment",
    rationale,
  }];
}

async function importDecisions(manifest, importPath, records) {
  const submitted = JSON.parse(await readFile(path.resolve(ROOT, importPath), "utf8"));
  if (!Array.isArray(submitted.decisions)) throw new Error("Imported review file must contain a decisions array.");
  const candidateKeys = new Set(buildCandidates(records, { decisions: [] }).map((candidate) => `${candidate.assetId}:${candidate.field}`));
  const accepted = [];
  for (const decision of submitted.decisions) {
    if (!decision || !candidateKeys.has(`${decision.assetId}:${decision.field}`)) throw new Error("Imported decision does not identify one current candidate field.");
    if (!ACTIONS.has(decision.action)) throw new Error("Imported decision action must be approve, reject, correct, or skip.");
    if (decision.assetId === "*" || decision.field === "*") throw new Error("Bulk or wildcard metadata decisions are not allowed.");
    accepted.push({ assetId: decision.assetId, field: decision.field, action: decision.action, value: decision.value || null, reviewer: decision.reviewer || null, reviewedOn: decision.reviewedOn || null, note: decision.note || null });
  }
  const merged = new Map(manifest.decisions.map((decision) => [`${decision.assetId}:${decision.field}`, decision]));
  for (const decision of accepted) merged.set(`${decision.assetId}:${decision.field}`, decision);
  manifest.decisions = [...merged.values()].sort((left, right) => left.assetId.localeCompare(right.assetId) || left.field.localeCompare(right.field));
  manifest.reviewedOn = new Date().toISOString().slice(0, 10);
}

function validateManifest(manifest) {
  if (manifest?.version !== 1 || !Array.isArray(manifest.decisions)) throw new Error("metadata-review-decisions.json must use version 1 and a decisions array.");
  if (manifest.publicPromotion !== "none") throw new Error("This workflow must not automatically promote metadata to public fields.");
}

function renderStatus(records, candidates) {
  const uniqueRoutes = new Set(candidates.map((candidate) => candidate.assetId)).size;
  const byState = tally(candidates, (candidate) => candidate.state);
  const decided = candidates.filter((candidate) => candidate.decision).length;
  const candidateValues = candidates.reduce((total, candidate) => total + candidate.candidateValues.length, 0);
  return `# Metadata review status\n\nGenerated from the immutable runtime printable inventory. This is a review queue, not a publishing system: no candidate is promoted into visible metadata by this command.\n\n- Printable routes: ${records.length}\n- Routes with candidate metadata: ${uniqueRoutes}\n- Field-level candidates: ${candidates.length}\n- Underlying collection-label values: ${candidateValues}\n- Imported per-field decisions: ${decided}\n- Automatic promotion (State A): 0\n\n## Current disposition\n\n| State | Candidate fields | Handling |\n| --- | ---: | --- |\n${[...byState.entries()].map(([state, count]) => `| ${state} | ${count} | ${state.startsWith("B.") ? "Reviewer confirms or rejects the bounded rule candidate." : "Reviewer inspects the artwork and policy context; collection membership alone is insufficient."} |`).join("\n")}\n\n## Guardrails\n\n- Each decision must name one asset ID and one field; wildcard and bulk imports are rejected.\n- Decisions are written only to the version-controlled manifest. A separate approved implementation step is required before any public field changes.\n- The local review UI is under \`pipeline/review/\` and is ignored by Git; it does not create a public route.\n- Audience and detail attributes remain \`null\` in runtime data until a separately reviewed implementation deliberately applies approved decisions.\n`;
}

function renderCsv(candidates) {
  const header = ["asset_id", "route", "title", "primary_hub_id", "field", "candidate_value", "state", "confidence", "provenance", "decision", "decision_value", "reviewer", "reviewed_on", "rationale"];
  const rows = candidates.map((candidate) => [candidate.assetId, candidate.route, candidate.title, candidate.primaryHubId, candidate.field, candidate.candidateValue, candidate.state, candidate.confidence, candidate.provenance, candidate.decision?.action || "pending", candidate.decision?.value || "", candidate.decision?.reviewer || "", candidate.decision?.reviewedOn || "", candidate.rationale]);
  return [header, ...rows].map((row) => row.map(csv).join(",")).join("\n") + "\n";
}

function renderBatches(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.state}|${candidate.field}|${candidate.primaryHubId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const rows = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, entries]) => {
    const [state, field, hub] = key.split("|");
    return `| ${state} | ${field} | ${entries[0].confidence} | ${hub} | ${entries.length} | ${entries.slice(0, 3).map((entry) => `\`${entry.assetId}\``).join(", ")} |`;
  });
  return `# Metadata review batches\n\nBatches are for navigation and sampling only. They are not approval groups; every decision stays per record and per field.\n\n| State | Field | Confidence | Primary collection | Fields | First candidate IDs |\n| --- | --- | --- | --- | ---: | --- |\n${rows.join("\n")}\n`;
}

function renderSampling(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.state}|${candidate.field}|${candidate.primaryHubId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const samples = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([key, entries]) => entries.slice(0, Math.min(3, entries.length)).map((entry) => `- ${key}: [${entry.title}](${entry.route}): proposed \`${entry.candidateValue}\`.`));
  return `# Metadata review sampling\n\nThese deterministic samples make the queue auditable without claiming that a collection label proves a per-image attribute. Review the image and source context before deciding.\n\n${samples.join("\n")}\n`;
}

function renderReviewUi() {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local metadata review</title><style>body{font:14px system-ui;margin:24px;color:#1d2433}header{max-width:900px}label,select,input,button{font:inherit;margin:.25rem}.row{display:grid;grid-template-columns:96px 1fr 14rem;gap:16px;align-items:start;border-top:1px solid #dde3ea;padding:12px 0}.row img{width:96px;height:144px;object-fit:contain;background:#f5f7fa}.meta{color:#526071}.controls{display:grid;gap:6px}@media(max-width:700px){.row{grid-template-columns:72px 1fr}.row img{width:72px;height:108px}.controls{grid-column:2}}</style><header><h1>Local metadata review</h1><p>This ignored local tool only prepares explicit per-field decisions. It cannot publish metadata. Load <code>candidates.json</code>, review each image, then download the decisions for deliberate import.</p><input id="file" type="file" accept="application/json"><label>Field <select id="field"><option value="">All</option><option>detailClassification</option><option>audienceClassification</option></select></label><label>Collection <input id="hub" placeholder="hub_animals"></label><button id="download">Download decisions</button><span id="progress"></span></header><main id="rows"></main><script>let data=[],decisions={};const $=id=>document.getElementById(id);$('file').onchange=async e=>{data=(JSON.parse(await e.target.files[0].text()).candidates||[]);render()};$('field').onchange=render;$('hub').oninput=render;$('download').onclick=()=>{const blob=new Blob([JSON.stringify({decisions:Object.values(decisions)},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='metadata-review-decisions.json';a.click();URL.revokeObjectURL(a.href)};function render(){const field=$('field').value,hub=$('hub').value.trim(),rows=data.filter(x=>(!field||x.field===field)&&(!hub||x.primaryHubId.includes(hub)));$('rows').innerHTML=rows.map(x=>{const k=x.assetId+':'+x.field,d=decisions[k]||{};return '<article class="row"><img src="/'+x.previewPath+'" alt=""><div><strong>'+esc(x.title)+'</strong><div class="meta">'+esc(x.route)+'<br>'+esc(x.field)+' → '+esc(x.candidateValue)+'<br>'+esc(x.state)+' · '+esc(x.rationale)+'</div></div><div class="controls"><select data-k="'+k+'"><option value="">Choose action</option><option'+sel(d.action,'approve')+'>approve</option><option'+sel(d.action,'reject')+'>reject</option><option'+sel(d.action,'correct')+'>correct</option><option'+sel(d.action,'skip')+'>skip</option></select><input data-v="'+k+'" value="'+esc(d.value||'')+'" placeholder="corrected value or note"></div></article>'}).join('');document.querySelectorAll('select[data-k]').forEach(e=>e.onchange=()=>set(e.dataset.k,{action:e.value}));document.querySelectorAll('input[data-v]').forEach(e=>e.oninput=()=>set(e.dataset.v,{value:e.value}));$('progress').textContent=Object.values(decisions).filter(x=>x.action).length+' decided'}function set(key,patch){const x=data.find(x=>x.assetId+':'+x.field===key),d=decisions[key]||{assetId:x.assetId,field:x.field};decisions[key]={...d,...patch};$('progress').textContent=Object.values(decisions).filter(x=>x.action).length+' decided'}function sel(a,b){return a===b?' selected':''}function esc(s){return String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}</script>`;
}

function tally(values, selector) { const map = new Map(); for (const value of values) { const key = selector(value); map.set(key, (map.get(key) || 0) + 1); } return map; }
function csv(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function readImportPath(args) { if (!args.length) return null; if (args.length === 2 && args[0] === "--import") return args[1]; throw new Error("Usage: node pipeline/scripts/build-metadata-review-workflow.mjs [--import decision-file.json]"); }
async function readJson(relativePath) { return JSON.parse(await readFile(path.resolve(ROOT, relativePath), "utf8")); }
async function writeJson(relativePath, value) { await writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`); }
async function writeText(relativePath, value) { const target = path.resolve(ROOT, relativePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value, "utf8"); }

main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
