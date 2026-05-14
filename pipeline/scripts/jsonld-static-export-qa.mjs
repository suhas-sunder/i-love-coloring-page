import { execFile } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const OUT_DIR = path.join(REPO_ROOT, "out");
const OUTPUTS = {
  manifests: path.join(REPO_ROOT, "pipeline", "manifests"),
  reports: path.join(REPO_ROOT, "pipeline", "reports"),
};
const SAMPLE_PAGES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/t-rex",
  "/about",
  "/contact",
  "/privacy",
];

async function main() {
  await mkdir(OUTPUTS.manifests, { recursive: true });
  await mkdir(OUTPUTS.reports, { recursive: true });
  await runBuild();

  const server = await startStaticServer();
  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const pageResults = [];

    for (const pagePath of SAMPLE_PAGES) {
      const response = await fetch(`${baseUrl}${pagePath}`);
      const html = await response.text();
      pageResults.push({
        path: pagePath,
        status: response.status,
        jsonLdScriptCount: countJsonLdScripts(html),
        containsOgImage: /property="og:image"|name="twitter:image"/i.test(html),
        containsLocalhostInMetadata: /https?:\/\/localhost|127\.0\.0\.1/i.test(html),
        containsR2DevInMetadata: /r2\.dev/i.test(html),
        containsLiveAdsenseCode: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(html),
      });
    }

    const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
    const imageSitemap = await fetch(`${baseUrl}/image-sitemap.xml`);
    const summary = {
      staticExportPassed: true,
      sampledStaticHtmlContainsJsonLd: pageResults.every((page) => page.jsonLdScriptCount >= 1),
      jsonLdScriptCountExpected: pageResults.every((page) => page.jsonLdScriptCount === 1),
      regularSitemapStillWorks: sitemap.status === 200,
      imageSitemapStillWorks: imageSitemap.status === 200,
      ogMetadataStillWorks: pageResults.filter((page) => page.path === "/" || page.path.startsWith("/coloring-pages")).every((page) => page.containsOgImage),
      noLocalhostInMetadata: pageResults.every((page) => !page.containsLocalhostInMetadata),
      noR2DevInMetadata: pageResults.every((page) => !page.containsR2DevInMetadata),
      appApiRoutePresent: existsSync(path.join(REPO_ROOT, "app", "api")),
      liveAdsenseCodePresent: pageResults.some((page) => page.containsLiveAdsenseCode),
      pagesChecked: pageResults.length,
    };

    const result = {
      generatedAt: new Date().toISOString(),
      phase: "jsonld",
      baseUrl,
      summary,
      pages: pageResults,
    };

    await writeJson("jsonld-static-export-qa-results.json", result);
    await writeReport("jsonld-static-export-qa-report.md", report(result));
    console.log(`JSON-LD static export QA ${summary.sampledStaticHtmlContainsJsonLd ? "passed" : "failed"}.`);
  } finally {
    server.closeAllConnections?.();
    server.closeIdleConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runBuild() {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm run build"] : ["run", "build"];
  await execFileAsync(command, args, {
    cwd: REPO_ROOT,
    maxBuffer: 1024 * 1024 * 20,
  });
}

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = await resolveOutFile(requestUrl.pathname);
    if (!filePath) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return Object.assign(server, { port: server.address().port });
}

async function resolveOutFile(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidates = [];
  if (!cleanPath) candidates.push(path.join(OUT_DIR, "index.html"));
  else {
    candidates.push(path.join(OUT_DIR, cleanPath));
    candidates.push(path.join(OUT_DIR, cleanPath, "index.html"));
    candidates.push(path.join(OUT_DIR, `${cleanPath}.html`));
  }

  for (const candidate of candidates) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Try next static export candidate.
    }
  }
  return null;
}

function contentType(filePath) {
  if (filePath.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".jpg")) return "image/jpeg";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function countJsonLdScripts(html) {
  return (html.match(/type=["']application\/ld\+json["']/gi) || []).length;
}

async function writeJson(fileName, data) {
  await writeFile(path.join(OUTPUTS.manifests, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

async function writeReport(fileName, markdown) {
  await writeFile(path.join(OUTPUTS.reports, fileName), `${markdown.trim()}\n`);
}

function report(result) {
  const s = result.summary;
  return `# JSON-LD Static Export QA

- Static export passed: ${s.staticExportPassed}
- Sampled static HTML contains JSON-LD: ${s.sampledStaticHtmlContainsJsonLd}
- JSON-LD script count expected: ${s.jsonLdScriptCountExpected}
- Regular sitemap works: ${s.regularSitemapStillWorks}
- Image sitemap works: ${s.imageSitemapStillWorks}
- OG metadata works: ${s.ogMetadataStillWorks}
- app/api present: ${s.appApiRoutePresent}

## Pages

${result.pages.map((page) => `- ${page.path}: status ${page.status}, JSON-LD scripts ${page.jsonLdScriptCount}`).join("\n")}
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
