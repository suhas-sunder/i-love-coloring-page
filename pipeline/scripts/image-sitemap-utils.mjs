import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SITE_URL = "https://www.ilovecoloringpage.com";
export const ASSET_BASE_URL = "https://assets.ilovecoloringpage.com/coloring-pages";
export const CONTACT_EMAIL = "admin@ilovecoloringpage.com";
export const IMAGE_SITEMAP_PATH = "public/image-sitemap.xml";
export const IMAGE_SITEMAP_URL = `${SITE_URL}/image-sitemap.xml`;
export const REGULAR_SITEMAP_URL = `${SITE_URL}/sitemap.xml`;
export const MAX_SITEMAP_URLS = 50_000;
export const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGES_PER_URL = 1_000;
export const RUN_ID = "image-sitemap";

export function repoPath(relativePath) {
  return path.join(REPO_ROOT, relativePath);
}

export async function readJson(relativePath) {
  return JSON.parse(await readFile(repoPath(relativePath), "utf8"));
}

export async function readText(relativePath) {
  return readFile(repoPath(relativePath), "utf8");
}

export async function writeJson(relativePath, value) {
  await ensureParent(relativePath);
  await writeFile(repoPath(relativePath), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(relativePath, value) {
  await ensureParent(relativePath);
  await writeFile(repoPath(relativePath), value, "utf8");
}

export async function ensureParent(relativePath) {
  await mkdir(path.dirname(repoPath(relativePath)), { recursive: true });
}

export async function listFilesIfExists(relativePath) {
  const root = repoPath(relativePath);
  if (!existsSync(root)) return [];
  const rootStat = await stat(root);
  if (rootStat.isFile()) return [relativePath.replace(/\\/g, "/")];

  const results = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else results.push(path.relative(REPO_ROOT, absolute).replace(/\\/g, "/"));
    }
  }
  await walk(root);
  return results;
}

export function getGitOutput(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

export function gitObjectExists(ref) {
  try {
    execFileSync("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function encodeAssetSubpath(assetSubpath) {
  return assetSubpath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function resolveWebpUrl(assetSubpath) {
  if (!assetSubpath || !assetSubpath.startsWith("webp/") || !assetSubpath.endsWith(".webp")) return "";
  return `${ASSET_BASE_URL}/${encodeAssetSubpath(assetSubpath)}`;
}

export function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return "";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function publicPageUrl(route) {
  return `${SITE_URL}${normalizePathname(route)}`;
}

export function hasBannedUrlPattern(url) {
  return /localhost|127\.0\.0\.1|r2\.dev|\/svg\/|\/png\/|\/thumbs\/|coloring-pages\/coloring-pages/i.test(url);
}

export function countRegularSitemapLocs(runtimeSiteMap, trustPagesSource) {
  const runtimeEntries = Array.isArray(runtimeSiteMap.entries) ? runtimeSiteMap.entries.length : 0;
  const trustIndexableCount = [...trustPagesSource.matchAll(/indexable:\s*true/g)].length;
  return 1 + runtimeEntries + trustIndexableCount;
}

export function buildMarkdownTable(headers, rows) {
  const safeRows = rows.length ? rows : [headers.map(() => "")];
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...safeRows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`),
  ].join("\n");
}

export function summarizeBoolean(value) {
  return value ? "pass" : "fail";
}

export function makeGeneratedAt(inputs) {
  return (
    inputs
      .map((input) => input?.generatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || "2026-05-13T00:00:00.000Z"
  );
}

export function getImageSitemapFilesFromBuild(buildResults) {
  return buildResults?.files?.map((file) => file.path) || [IMAGE_SITEMAP_PATH];
}
