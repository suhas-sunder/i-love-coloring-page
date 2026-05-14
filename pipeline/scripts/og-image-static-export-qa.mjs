import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = process.cwd();
const GENERATED_AT = new Date().toISOString();
const SITE_URL = "https://www.ilovecoloringpage.com";
const PORT = 4183;
const SAMPLE_ROUTES = ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/t-rex", "/coloring-pages/dragons", "/coloring-pages/geometric", "/coloring-pages/christmas", "/coloring-pages/plushies"];
const SAMPLE_OG_IMAGES = ["/og/home.jpg", "/og/coloring-pages.jpg", "/og/hubs/animals.jpg", "/og/hubs/t-rex.jpg", "/og/hubs/dragons.jpg"];

async function main() {
  const build = await runCommand("npm.cmd", ["run", "build"]);
  const server = await startStaticServer(path.join(REPO_ROOT, "out"), PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;

  try {
    const imageChecks = [];
    for (const imagePath of SAMPLE_OG_IMAGES) {
      imageChecks.push(await checkUrl(`${baseUrl}${imagePath}`, "image/jpeg"));
    }

    const htmlChecks = [];
    for (const routePath of SAMPLE_ROUTES) {
      const response = await fetchText(`${baseUrl}${routePath}`);
      htmlChecks.push({
        path: routePath,
        status: response.status,
        ok: response.ok,
        hasOgImage: /property="og:image" content="https:\/\/www\.ilovecoloringpage\.com\/og\//.test(response.text),
        hasTwitterImage: /name="twitter:image" content="https:\/\/www\.ilovecoloringpage\.com\/og\//.test(response.text),
        hasOgWidth: /property="og:image:width" content="1200"/.test(response.text),
        hasOgHeight: /property="og:image:height" content="630"/.test(response.text),
        noLocalhost: !/localhost|127\.0\.0\.1/.test(response.text),
        noR2Dev: !/r2\.dev/.test(response.text),
      });
    }

    const sitemap = await checkUrl(`${baseUrl}/sitemap.xml`, "application/xml");
    const imageSitemap = await checkUrl(`${baseUrl}/image-sitemap.xml`, "application/xml");
    const robots = await fetchText(`${baseUrl}/robots.txt`);
    const appApiRoutePresent = existsSync(path.join(REPO_ROOT, "app", "api"));

    const summary = {
      staticExportPassed: build.exitCode === 0,
      homeOgImageAccessible: imageChecks.find((entry) => entry.url.endsWith("/og/home.jpg"))?.ok === true,
      coloringPagesOgImageAccessible: imageChecks.find((entry) => entry.url.endsWith("/og/coloring-pages.jpg"))?.ok === true,
      sampleHubOgImagesAccessible: imageChecks.filter((entry) => /\/og\/hubs\//.test(entry.url)).every((entry) => entry.ok),
      homeHtmlIncludesOgImage: htmlChecks.find((entry) => entry.path === "/")?.hasOgImage === true,
      coloringPagesHtmlIncludesOgImage: htmlChecks.find((entry) => entry.path === "/coloring-pages")?.hasOgImage === true,
      sampleHubHtmlIncludesOgImage: htmlChecks.filter((entry) => entry.path.startsWith("/coloring-pages/")).every((entry) => entry.hasOgImage),
      twitterImagePresent: htmlChecks.every((entry) => entry.hasTwitterImage),
      ogImageDimensionsPresent: htmlChecks.every((entry) => entry.hasOgWidth && entry.hasOgHeight),
      noRouteReferencesMissingOgFile: imageChecks.every((entry) => entry.ok),
      noLocalOrR2DevUrls: htmlChecks.every((entry) => entry.noLocalhost && entry.noR2Dev),
      regularSitemapStillWorks: sitemap.ok,
      imageSitemapStillWorks: imageSitemap.ok,
      appApiRoutePresent,
    };

    const passed =
      summary.staticExportPassed &&
      summary.homeOgImageAccessible &&
      summary.coloringPagesOgImageAccessible &&
      summary.sampleHubOgImagesAccessible &&
      summary.homeHtmlIncludesOgImage &&
      summary.coloringPagesHtmlIncludesOgImage &&
      summary.sampleHubHtmlIncludesOgImage &&
      summary.twitterImagePresent &&
      summary.ogImageDimensionsPresent &&
      summary.noRouteReferencesMissingOgFile &&
      summary.noLocalOrR2DevUrls &&
      summary.regularSitemapStillWorks &&
      summary.imageSitemapStillWorks &&
      !summary.appApiRoutePresent;
    summary.staticExportQaPassed = passed;

    const payload = {
      generatedAt: GENERATED_AT,
      phase: "og-image",
      summary,
      build: {
        exitCode: build.exitCode,
        stdoutTail: tail(build.stdout),
        stderrTail: tail(build.stderr),
      },
      imageChecks,
      htmlChecks,
      sitemap,
      imageSitemap,
      robots: {
        status: robots.status,
        ok: robots.ok,
        referencesImageSitemap: robots.text.includes(`${SITE_URL}/image-sitemap.xml`),
      },
    };

    await writeJson("pipeline/manifests/og-image-static-export-qa-results.json", payload);
    await writeText("pipeline/reports/og-image-static-export-qa-report.md", renderReport(payload));
    console.log(`Static export OG QA ${passed ? "passed" : "failed"}.`);
    if (!passed) process.exitCode = 1;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runCommand(command, args) {
  try {
    const actualCommand = process.platform === "win32" && command === "npm.cmd" ? "cmd.exe" : command;
    const actualArgs = process.platform === "win32" && command === "npm.cmd" ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args;
    const { stdout, stderr } = await execFileAsync(actualCommand, actualArgs, { cwd: REPO_ROOT, maxBuffer: 1024 * 1024 * 20 });
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    return {
      exitCode: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message || String(error),
    };
  }
}

async function startStaticServer(root, port) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
      const filePath = await resolveStaticPath(root, decodeURIComponent(url.pathname));
      if (!filePath) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": getContentType(filePath) });
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function resolveStaticPath(root, pathname) {
  const safePath = pathname.replace(/^\/+/, "");
  const candidates = [];
  if (!safePath) candidates.push(path.join(root, "index.html"));
  else {
    candidates.push(path.join(root, safePath));
    candidates.push(path.join(root, `${safePath}.html`));
    candidates.push(path.join(root, safePath, "index.html"));
  }

  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Continue to next candidate.
    }
  }
  return null;
}

function getContentType(filePath) {
  if (/\.html$/i.test(filePath)) return "text/html; charset=utf-8";
  if (/\.xml$/i.test(filePath)) return "application/xml; charset=utf-8";
  if (/\.txt$/i.test(filePath)) return "text/plain; charset=utf-8";
  if (/\.jpg$/i.test(filePath)) return "image/jpeg";
  if (/\.webp$/i.test(filePath)) return "image/webp";
  if (/\.js$/i.test(filePath)) return "text/javascript; charset=utf-8";
  if (/\.css$/i.test(filePath)) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function fetchText(url) {
  try {
    const response = await fetch(url);
    return { url, status: response.status, ok: response.ok, contentType: response.headers.get("content-type") || "", text: await response.text() };
  } catch (error) {
    return { url, status: 0, ok: false, contentType: "", text: "", error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkUrl(url, expectedContentType) {
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    return {
      url,
      status: response.status,
      ok: response.ok && contentType.includes(expectedContentType),
      contentType,
    };
  } catch (error) {
    return { url, status: 0, ok: false, contentType: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function renderReport(payload) {
  return [
    "# OG Image Static Export QA Report",
    "",
    `Generated: ${payload.generatedAt}`,
    "",
    `- Static export passed: ${payload.summary.staticExportPassed}`,
    `- Home OG image accessible: ${payload.summary.homeOgImageAccessible}`,
    `- /coloring-pages OG image accessible: ${payload.summary.coloringPagesOgImageAccessible}`,
    `- Sample hub OG images accessible: ${payload.summary.sampleHubOgImagesAccessible}`,
    `- Homepage HTML includes og:image: ${payload.summary.homeHtmlIncludesOgImage}`,
    `- /coloring-pages HTML includes og:image: ${payload.summary.coloringPagesHtmlIncludesOgImage}`,
    `- Sample hub HTML includes og:image: ${payload.summary.sampleHubHtmlIncludesOgImage}`,
    `- twitter:image present: ${payload.summary.twitterImagePresent}`,
    `- og:image dimensions present: ${payload.summary.ogImageDimensionsPresent}`,
    `- Regular sitemap works: ${payload.summary.regularSitemapStillWorks}`,
    `- Image sitemap works: ${payload.summary.imageSitemapStillWorks}`,
    `- app/api present: ${payload.summary.appApiRoutePresent}`,
    `- QA passed: ${payload.summary.staticExportQaPassed}`,
  ].join("\n");
}

async function writeJson(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(relativePath, value) {
  await mkdir(path.dirname(path.join(REPO_ROOT, relativePath)), { recursive: true });
  await writeFile(path.join(REPO_ROOT, relativePath), `${value.trimEnd()}\n`);
}

function tail(value) {
  return String(value || "").split(/\r?\n/).slice(-40).join("\n");
}

await main();
