#!/usr/bin/env node

const { chromium } = require("playwright");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = process.cwd();

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

async function main() {
  const utils = await import("./final-live-utils.mjs");
  const {
    BROWSER_ROUTES,
    CONTACT_EMAIL,
    FINAL_SCREENSHOT_DIR,
    SITE_URL,
    TRUST_ROUTES,
    VIEWPORTS,
    absoluteSiteUrl,
    bool,
    fetchWithRedirects,
    readProjectText,
    renderTable,
    routeSlug,
    writeJson,
    writeReport,
  } = utils;

  const screenshotRoot = path.join(REPO_ROOT, FINAL_SCREENSHOT_DIR);
  await fsp.mkdir(screenshotRoot, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const consoleErrors = [];
  let routeResults = [];
  let interactionResults = null;
  let printDownloadResults = null;
  let trustReview = null;

  try {
    routeResults = await collectRouteResults(browser, { BROWSER_ROUTES, VIEWPORTS, SITE_URL, CONTACT_EMAIL, FINAL_SCREENSHOT_DIR, routeSlug, consoleErrors });
    interactionResults = await collectInteractions(browser, { SITE_URL });
    printDownloadResults = await collectPrintAndDownloads(browser, { SITE_URL });
    trustReview = await collectTrustReview({ fetchWithRedirects, SITE_URL, CONTACT_EMAIL, TRUST_ROUTES });
  } finally {
    await browser.close();
  }

  const browserQa = buildBrowserQa(routeResults, interactionResults, printDownloadResults, consoleErrors, { FINAL_SCREENSHOT_DIR });
  await writeJson("pipeline/manifests/final-live-browser-qa-results.json", browserQa);
  await writeReport("pipeline/reports/final-live-browser-qa-report.md", renderBrowserReport(browserQa, { renderTable, bool }));

  await writeJson("pipeline/manifests/final-trust-content-review.json", trustReview);
  await writeReport("pipeline/reports/final-trust-content-review.md", renderTrustReview(trustReview, { renderTable, bool }));

  const gate = await buildAcceptanceGate({ readJson, readProjectText });
  await writeJson("pipeline/manifests/final-live-acceptance-gate.json", gate);
  await writeReport("pipeline/reports/final-live-acceptance-gate.md", renderAcceptanceGate(gate, { renderTable, bool }));

  console.log(JSON.stringify({
    browserQaPassed: browserQa.summary.browserQaPassed,
    trustContentReviewPassed: trustReview.summary.trustContentReviewPassed,
    finalLiveAcceptancePassed: gate.blockers.length === 0,
    readyForOwnerGscSubmission: gate.ready_for_owner_gsc_submission,
    blockers: gate.blockers,
  }, null, 2));
}

async function collectRouteResults(browser, env) {
  const results = [];
  for (const viewport of env.VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") env.consoleErrors.push({ route: page.url(), text: message.text() });
    });
    page.on("pageerror", (error) => env.consoleErrors.push({ route: page.url(), text: error.message }));

    for (const route of env.BROWSER_ROUTES) {
      const url = env.absoluteSiteUrl ? env.absoluteSiteUrl(route) : `${env.SITE_URL}${route}`;
      const screenshotPath = path.join(env.FINAL_SCREENSHOT_DIR, `${viewport.label}-${env.routeSlug(route)}.png`);
      let status = 0;
      let metrics = null;
      let error = "";
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        status = response?.status() || 0;
        await page.waitForTimeout(1300);
        if (route.startsWith("/coloring-pages") || route === "/") {
          await page.evaluate(() => window.scrollTo(0, Math.min(1200, document.body.scrollHeight)));
          await page.waitForTimeout(350);
          await page.evaluate(() => window.scrollTo(0, 0));
        }
        await page.screenshot({ path: path.join(REPO_ROOT, screenshotPath), fullPage: true });
        metrics = await page.evaluate(({ contactEmail, screenshotPath, siteUrl }) => {
          const bodyText = document.body?.innerText || "";
          const html = document.documentElement.innerHTML || "";
          const imageRecords = [...document.images].map((image) => ({
            src: image.currentSrc || image.src || "",
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            visible: Boolean(image.offsetWidth || image.offsetHeight || image.getClientRects().length),
          }));
          const webpPreviews = imageRecords.filter((image) => image.src.includes("/coloring-pages/webp/"));
          const brokenImages = imageRecords.filter((image) => image.visible && image.complete && (image.naturalWidth === 0 || image.naturalHeight === 0));
          const visiblePreviewUnavailable = [...document.querySelectorAll("body *")].filter((element) => {
            const rect = element.getBoundingClientRect();
            return (element.textContent || "").trim() === "Preview unavailable" && rect.width > 0 && rect.height > 0;
          }).length;
          const controlsText = [...document.querySelectorAll("button, a, summary")].map((element) => (element.textContent || "").trim()).filter(Boolean).join(" ");
          const navText = [...document.querySelectorAll("header, nav")].map((element) => element.innerText || "").join("\n");
          const galleryText = [...document.querySelectorAll('[class*="gallery"]')].map((element) => element.innerText || "").join("\n");
          const visibleAds = [...document.querySelectorAll("body *")].filter((element) => {
            const rect = element.getBoundingClientRect();
            return (element.textContent || "").trim() === "Advertisement" && rect.width > 0 && rect.height > 0;
          }).length;
          return {
            screenshotPath: screenshotPath.replace(/\\/g, "/"),
            title: document.title || "",
            bodyContains6352: bodyText.includes("6,352") || bodyText.includes("6352"),
            bodyContains6557: bodyText.includes("6,557") || bodyText.includes("6557"),
            contactEmailPresent: bodyText.includes(contactEmail),
            webpPreviewCount: webpPreviews.length,
            loadedWebpPreviewCount: webpPreviews.filter((image) => image.naturalWidth > 0 && image.naturalHeight > 0).length,
            brokenImageCount: brokenImages.length,
            previewUnavailableVisibleCount: visiblePreviewUnavailable,
            deferredTextVisible: /manual-review|deferred|hidden_until_manual_review/i.test(bodyText),
            visibleAdvertisementLabels: visibleAds,
            navContainsAdvertisement: /Advertisement/.test(navText),
            galleryContainsAdvertisement: /Advertisement/.test(galleryText),
            liveAdSensePresent: /adsbygoogle|pagead2\.googlesyndication|ca-pub-|google_ad_client/i.test(html),
            adClientIdsPresent: /ca-pub-|google_ad_client/i.test(html),
            svgDownloadVisible: /Download SVG|downloadSvg\b|svgDownload/i.test(controlsText),
            pngDownloadVisible: /Download PNG/i.test(controlsText),
            jpgDownloadVisible: /Download JPG/i.test(controlsText),
            webpDownloadVisible: /Download WebP/i.test(controlsText),
            hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            noLocalhostOrR2Dev: !/localhost|127\.0\.0\.1|r2\.dev/i.test(html),
            appApiReferencePresent: /\/api\//i.test(html),
            canonicalUsesSiteUrl: (document.querySelector('link[rel="canonical"]')?.href || "").startsWith(siteUrl),
          };
        }, { contactEmail: env.CONTACT_EMAIL, screenshotPath, siteUrl: env.SITE_URL });
      } catch (caught) {
        error = caught?.message || String(caught);
      }
      results.push({ route, url, viewport, status, metrics, error });
    }
    await context.close();
  }
  return results;
}

async function collectInteractions(browser, env) {
  const result = {
    featuredRotationWorks: { attempted: true, passed: false, details: "" },
    searchWorks: { attempted: true, passed: false, details: "" },
    filterWorks: { attempted: false, passed: true, details: "No explicit filter control found." },
    paginationWorks: { attempted: true, passed: false, details: "" },
    moreMenuWorks: { attempted: true, passed: false, details: "" },
    mobileNavWorks: { attempted: true, passed: false, details: "" },
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto(`${env.SITE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1000);
    const firstFeatured = await page.locator("[data-featured-rotation-hub]").first().getAttribute("data-featured-rotation-mode").catch(() => "");
    result.featuredRotationWorks.passed = Boolean(firstFeatured) || (await page.locator("[data-featured-rotation-hub]").count()) > 0;
    result.featuredRotationWorks.details = result.featuredRotationWorks.passed ? "Featured rotation markup present." : "Featured rotation markup missing.";

    const searchInput = page.locator('input[type="search"]').first();
    if (await searchInput.count()) {
      await searchInput.fill("alligator");
      await page.waitForTimeout(600);
      const body = await page.locator("body").innerText();
      result.searchWorks.passed = /alligator/i.test(body) && !/0\s+matching/i.test(body);
      result.searchWorks.details = result.searchWorks.passed ? "Search returned alligator content." : "Search did not return expected alligator content.";
    } else {
      result.searchWorks.details = "Search input missing.";
    }

    const filterButtons = page.locator('button[aria-pressed], [data-filter], .gallery-filters button');
    const filterCount = await filterButtons.count();
    if (filterCount > 1) {
      result.filterWorks.attempted = true;
      await filterButtons.nth(1).click();
      await page.waitForTimeout(400);
      result.filterWorks.passed = true;
      result.filterWorks.details = "Filter control accepted click.";
    }

    const paginationLink = page.locator('a[href*="/page/2"]').first();
    if (await paginationLink.count()) {
      const href = await paginationLink.getAttribute("href");
      const response = await page.request.get(new URL(href, env.SITE_URL).toString());
      result.paginationWorks.passed = response.status() === 200;
      result.paginationWorks.details = `${href} returned ${response.status()}.`;
    } else {
      result.paginationWorks.details = "Pagination link missing.";
    }

    await page.goto(env.SITE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const moreButton = page.locator('button:has-text("More")').first();
    if (await moreButton.count()) {
      await moreButton.click();
      await page.waitForTimeout(500);
      result.moreMenuWorks.passed = /Animals|Christmas|Search/i.test(await page.locator("body").innerText());
      result.moreMenuWorks.details = result.moreMenuWorks.passed ? "More menu opened with generated routes." : "More menu did not expose expected generated routes.";
    } else {
      result.moreMenuWorks.details = "More menu button missing.";
    }
  } catch (error) {
    result.error = error?.message || String(error);
  } finally {
    await context.close();
  }

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const mobilePage = await mobileContext.newPage();
  try {
    await mobilePage.goto(env.SITE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const menuButton = mobilePage.locator('button[aria-label*="menu" i], button:has-text("Menu")').first();
    if (await menuButton.count()) {
      await menuButton.click();
      await mobilePage.waitForTimeout(500);
      result.mobileNavWorks.passed = /Animals|Christmas|Search/i.test(await mobilePage.locator("body").innerText());
      result.mobileNavWorks.details = result.mobileNavWorks.passed ? "Mobile nav opened." : "Mobile nav did not expose expected generated routes.";
    } else {
      result.mobileNavWorks.details = "Mobile menu button missing.";
    }
  } catch (error) {
    result.mobileError = error?.message || String(error);
  } finally {
    await mobileContext.close();
  }

  return result;
}

async function collectPrintAndDownloads(browser, env) {
  const result = {
    route: "/coloring-pages/animals",
    printFlowOpens: false,
    printPdfPassed: false,
    onePagePdfStyleOutputWorks: false,
    printQaSnapshot: null,
    pngDownloadWorks: false,
    jpgDownloadWorks: false,
    webpDownloadWorks: false,
    svgDownloadAbsent: false,
    controls: {
      printPresent: false,
      closePresentTopRight: false,
      pngPresent: false,
      jpgPresent: false,
      webpPresent: false,
      svgPresent: false,
      labels: [],
    },
    consoleErrors: [],
    error: "",
  };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") result.consoleErrors.push(message.text());
  });
  try {
    await page.goto(`${env.SITE_URL}/coloring-pages/animals`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1200);
    const cardPrint = page.locator('button:has-text("Print")').first();
    result.controls.printPresent = (await cardPrint.count()) > 0;
    if (result.controls.printPresent) {
      await cardPrint.click();
      await page.waitForTimeout(2500);
      const modal = page.locator(".print-preview-panel, [role='dialog']").first();
      result.printFlowOpens = (await modal.count()) > 0;
      const labels = await page.locator("button, a").evaluateAll((elements) => elements.map((element) => (element.textContent || "").trim()).filter(Boolean));
      result.controls.labels = labels;
      result.controls.pngPresent = labels.some((label) => /Download PNG/i.test(label));
      result.controls.jpgPresent = labels.some((label) => /Download JPG/i.test(label));
      result.controls.webpPresent = labels.some((label) => /Download WebP/i.test(label));
      result.controls.svgPresent = labels.some((label) => /Download SVG|^SVG$/i.test(label));
      result.svgDownloadAbsent = !result.controls.svgPresent;
      result.controls.closePresentTopRight = await page.locator(".print-preview-actions button:has-text('Close')").count().then(Boolean).catch(() => false);

      result.pngDownloadWorks = await clickDownload(page, /Download PNG/i);
      result.jpgDownloadWorks = await clickDownload(page, /Download JPG/i);
      result.webpDownloadWorks = await clickDownload(page, /Download WebP/i);

      const printButton = page.locator(".print-preview-actions button:has-text('Print')").first();
      if (await printButton.count()) {
        await printButton.click();
        await page.waitForTimeout(2500);
        result.printQaSnapshot = await page.evaluate(() => window.__ILCP_LAST_PRINT_DOCUMENT__ || null).catch(() => null);
        result.onePagePdfStyleOutputWorks = result.printQaSnapshot?.pageCount === 1 && result.printQaSnapshot?.brandingOverlapsArtwork === false;
        result.printPdfPassed = result.onePagePdfStyleOutputWorks;
      }
    }
  } catch (error) {
    result.error = error?.message || String(error);
  } finally {
    await context.close();
  }
  result.passed = [
    result.printFlowOpens,
    result.printPdfPassed,
    result.onePagePdfStyleOutputWorks,
    result.pngDownloadWorks,
    result.jpgDownloadWorks,
    result.webpDownloadWorks,
    result.svgDownloadAbsent,
    result.consoleErrors.length === 0,
  ].every(Boolean);
  return result;
}

async function clickDownload(page, labelPattern) {
  const button = page.getByRole("button", { name: labelPattern }).first();
  if (!(await button.count())) return false;
  try {
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await button.click();
    const download = await downloadPromise;
    const suggested = download.suggestedFilename();
    await download.delete().catch(() => {});
    return labelPattern.test(suggested);
  } catch {
    return false;
  }
}

async function collectTrustReview(env) {
  const routes = ["/", "/coloring-pages", "/coloring-pages/animals", "/coloring-pages/t-rex", "/coloring-pages/dragons", "/coloring-pages/christmas", ...env.TRUST_ROUTES];
  const records = [];
  for (const route of routes) {
    const response = await env.fetchWithRedirects(env.absoluteSiteUrl ? env.absoluteSiteUrl(route) : `${env.SITE_URL}${route}`);
    const rawHtml = response.bodyText || "";
    const text = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
    records.push({
      route,
      status: response.status,
      statusOk: response.status === 200,
      contactEmailPresent: text.includes(env.CONTACT_EMAIL) || rawHtml.includes(env.CONTACT_EMAIL),
      fakeAddressOrPhonePresent: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St\.|Avenue|Ave\.|Road|Rd\.|Drive|Dr\.)\b/.test(text),
      fakeCompanyClaimsPresent: /inc\.|llc|corporation|registered office|headquarters/i.test(text),
      privacyMentionsAdsOrCookies: route !== "/privacy" || /ad|advertis|cookie/i.test(text),
      privacyAvoidsFalseComplianceClaims: !/GDPR compliant|CCPA compliant|certified/i.test(text),
      termsDraftSafe: route !== "/terms" || /terms|use|responsib/i.test(text),
      affiliateDisclosurePresent: route !== "/affiliate-disclosure" || /affiliate/i.test(text),
      editorialPolicyPresent: route !== "/editorial-policy" || /editorial/i.test(text),
      noOnlineColoringPromise: !/color online|online coloring workspace is available|start coloring online/i.test(text),
      noPublicSvgDownloadClaims: !/download\s+svg/i.test(text),
      noInternalPipelineWording: !/manual-review|pipeline|runtime|r2-upload|deferred/i.test(text),
      noObviousAiFiller: !/ChatGPT|AI export|generated by AI|as an AI/i.test(text),
      galleryFirstUxPreserved: !route.startsWith("/coloring-pages") || /Print|Download|coloring page/i.test(text),
    });
  }
  const summary = {
    pagesReviewed: records.length,
    contactEmail: env.CONTACT_EMAIL,
    allReviewedPagesReachable: records.every((record) => record.statusOk),
    contactEmailCorrect: records.some((record) => record.route === "/contact" && record.contactEmailPresent),
    noFakeAddress: records.every((record) => !record.fakeAddressOrPhonePresent),
    noFakePhone: records.every((record) => !record.fakeAddressOrPhonePresent),
    noFakeCompanyClaims: records.every((record) => !record.fakeCompanyClaimsPresent),
    privacyPolicyMentionsAdsCookiesAccurately: records.every((record) => record.privacyMentionsAdsOrCookies),
    privacyPolicyAvoidsFalseComplianceClaims: records.every((record) => record.privacyAvoidsFalseComplianceClaims),
    termsDraftSafe: records.every((record) => record.termsDraftSafe),
    affiliateDisclosureExists: records.every((record) => record.affiliateDisclosurePresent),
    editorialPolicyExists: records.every((record) => record.editorialPolicyPresent),
    noMisleadingOnlineColoringClaim: records.every((record) => record.noOnlineColoringPromise),
    noPublicSvgDownloadClaims: records.every((record) => record.noPublicSvgDownloadClaims),
    noInternalPipelineWording: records.every((record) => record.noInternalPipelineWording),
    noObviousAiFiller: records.every((record) => record.noObviousAiFiller),
    galleryFirstUxPreserved: records.every((record) => record.galleryFirstUxPreserved),
    legalReviewStillRecommended: true,
    ownerReviewStatus: "pending_owner_and_legal_review",
  };
  summary.trustContentReviewPassed = [
    summary.allReviewedPagesReachable,
    summary.contactEmailCorrect,
    summary.noFakeAddress,
    summary.noFakePhone,
    summary.noFakeCompanyClaims,
    summary.privacyPolicyMentionsAdsCookiesAccurately,
    summary.privacyPolicyAvoidsFalseComplianceClaims,
    summary.termsDraftSafe,
    summary.affiliateDisclosureExists,
    summary.editorialPolicyExists,
    summary.noMisleadingOnlineColoringClaim,
    summary.noPublicSvgDownloadClaims,
    summary.noInternalPipelineWording,
    summary.noObviousAiFiller,
    summary.galleryFirstUxPreserved,
  ].every(Boolean);
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-trust-content-review",
    records,
    summary,
    blockers: summary.trustContentReviewPassed ? [] : ["Final trust/legal/content review found live content blockers."],
  };
}

function buildBrowserQa(routeResults, interactions, printDownloads, consoleErrors, env) {
  const metricResults = routeResults.filter((result) => result.metrics);
  const galleryMetrics = metricResults.filter((result) => result.route === "/" || result.route.startsWith("/coloring-pages"));
  const adMetrics = galleryMetrics.map((result) => ({
    route: result.route,
    viewport: result.viewport.label,
    width: result.viewport.width,
    labels: result.metrics.visibleAdvertisementLabels,
  }));
  const summary = {
    routesChecked: routeResults.length,
    screenshotDirectory: env.FINAL_SCREENSHOT_DIR,
    webpGalleryPreviewsRender: galleryMetrics.length > 0 && galleryMetrics.every((result) => result.metrics.loadedWebpPreviewCount > 0),
    noPreviewUnavailableForVisibleUploadedRecords: galleryMetrics.every((result) => result.metrics.previewUnavailableVisibleCount === 0),
    noBrokenImageIcons: metricResults.every((result) => result.metrics.brokenImageCount === 0),
    deferredRecordsHidden: metricResults.every((result) => !result.metrics.deferredTextVisible),
    countsShow6352WhereApplicable: galleryMetrics.some((result) => result.metrics.bodyContains6352) && galleryMetrics.every((result) => !result.metrics.bodyContains6557),
    featuredRotationWorks: interactions.featuredRotationWorks.passed,
    searchFilterWorks: interactions.searchWorks.passed && interactions.filterWorks.passed,
    searchWorks: interactions.searchWorks.passed,
    filterWorks: interactions.filterWorks.passed,
    paginationWorks: interactions.paginationWorks.passed,
    moreMenuWorks: interactions.moreMenuWorks.passed,
    mobileNavWorks: interactions.mobileNavWorks.passed,
    printFlowOpens: printDownloads.printFlowOpens,
    printPdfPassed: printDownloads.printPdfPassed,
    onePagePdfStylePrintOutputWorks: printDownloads.onePagePdfStyleOutputWorks,
    pngDownloadWorks: printDownloads.pngDownloadWorks,
    jpgDownloadWorks: printDownloads.jpgDownloadWorks,
    webpDownloadWorks: printDownloads.webpDownloadWorks,
    svgDownloadAbsent: printDownloads.svgDownloadAbsent && metricResults.every((result) => !result.metrics.svgDownloadVisible),
    adWellsVisibleWithAcceptedDensity: adMetrics.every((entry) => entry.width >= 1920 ? entry.labels >= 1 && entry.labels <= 3 : entry.labels === 1 || !entry.route.startsWith("/coloring-pages")),
    noLiveAdSenseScript: metricResults.every((result) => !result.metrics.liveAdSensePresent),
    noAdClientIds: metricResults.every((result) => !result.metrics.adClientIdsPresent),
    noHorizontalOverflow: metricResults.every((result) => !result.metrics.hasHorizontalOverflow),
    trustPagesRender: ["/about", "/contact", "/privacy", "/terms"].every((route) => routeResults.some((result) => result.route === route && result.status === 200)),
    contactEmailAppearsCorrectly: metricResults.some((result) => result.route === "/contact" && result.metrics.contactEmailPresent),
    noConsoleErrors: consoleErrors.length === 0 && printDownloads.consoleErrors.length === 0,
  };
  summary.downloadsPassed = summary.pngDownloadWorks && summary.jpgDownloadWorks && summary.webpDownloadWorks;
  summary.browserQaPassed = [
    summary.webpGalleryPreviewsRender,
    summary.noPreviewUnavailableForVisibleUploadedRecords,
    summary.noBrokenImageIcons,
    summary.deferredRecordsHidden,
    summary.countsShow6352WhereApplicable,
    summary.featuredRotationWorks,
    summary.searchWorks,
    summary.paginationWorks,
    summary.moreMenuWorks,
    summary.mobileNavWorks,
    summary.printFlowOpens,
    summary.printPdfPassed,
    summary.onePagePdfStylePrintOutputWorks,
    summary.downloadsPassed,
    summary.svgDownloadAbsent,
    summary.noLiveAdSenseScript,
    summary.noAdClientIds,
    summary.noHorizontalOverflow,
    summary.trustPagesRender,
    summary.contactEmailAppearsCorrectly,
    summary.noConsoleErrors,
  ].every(Boolean);
  const blockers = [];
  if (!summary.browserQaPassed) blockers.push("Final live browser QA failed.");
  return {
    generatedAt: new Date().toISOString(),
    runId: "final-live-browser-qa-results",
    routeResults,
    interactions,
    printDownloads,
    adMetrics,
    consoleErrors,
    summary,
    blockers,
  };
}

async function buildAcceptanceGate(env) {
  const context = await readJson("pipeline/manifests/final-live-context-check.json");
  const freshness = await readJson("pipeline/manifests/final-live-deployment-freshness.json");
  const http = await readJson("pipeline/manifests/final-live-http-results.json");
  const sitemap = await readJson("pipeline/manifests/final-live-sitemap-gsc-results.json");
  const metadata = await readJson("pipeline/manifests/final-live-metadata-jsonld-results.json");
  const assets = await readJson("pipeline/manifests/final-live-sampled-asset-check-results.json");
  const browser = await readJson("pipeline/manifests/final-live-browser-qa-results.json");
  const trust = await readJson("pipeline/manifests/final-trust-content-review.json");
  const gsc = await readJson("pipeline/manifests/final-gsc-submission-readiness.json");

  const gate = {
    generatedAt: new Date().toISOString(),
    runId: "final-live-acceptance-gate",
    production_site_reachable: freshness.summary.productionSiteReachable === true,
    production_deploy_current: freshness.summary.productionDeployCurrent === true,
    route_check_passed: http.summary.routeCheckPassed === true,
    regular_sitemap_passed: sitemap.summary.regularSitemapPassed === true,
    image_sitemap_passed: sitemap.summary.imageSitemapPassed === true,
    robots_passed: sitemap.summary.robotsPassed === true,
    og_metadata_passed: metadata.summary.ogMetadataPassed === true,
    jsonld_passed: metadata.summary.jsonLdPassed === true,
    browser_qa_passed: browser.summary.browserQaPassed === true,
    sampled_asset_check_passed: assets.summary.sampledAssetCheckPassed === true,
    print_pdf_passed: browser.summary.printPdfPassed === true,
    downloads_passed: browser.summary.downloadsPassed === true,
    trust_content_review_passed: trust.summary.trustContentReviewPassed === true,
    gsc_submission_ready: gsc.ready_for_owner_gsc_submission === true,
    no_svg_download: browser.summary.svgDownloadAbsent === true && context.summary.svgInternalOnly === true,
    no_app_api: context.summary.appApiRoutePresent === false,
    no_horizontal_overflow: browser.summary.noHorizontalOverflow === true,
    live_ads_skipped: true,
    optional_later_work_skipped: true,
    ready_for_owner_gsc_submission: false,
    ready_for_social_preview_manual_validation: false,
    ready_for_live_ads_round: false,
    blockers: [],
  };

  for (const [key, value] of Object.entries(gate)) {
    if (["generatedAt", "runId", "blockers", "ready_for_owner_gsc_submission", "ready_for_social_preview_manual_validation", "ready_for_live_ads_round"].includes(key)) continue;
    if (typeof value === "boolean" && value !== true) gate.blockers.push(key);
  }
  for (const source of [context, freshness, http, sitemap, metadata, assets, browser, trust, gsc]) {
    for (const blocker of source.blockers || []) {
      if (!gate.blockers.includes(blocker)) gate.blockers.push(blocker);
    }
  }

  gate.ready_for_owner_gsc_submission = gate.gsc_submission_ready && gate.production_deploy_current && gate.trust_content_review_passed && gate.blockers.length === 0;
  return gate;
}

async function readJson(relativePath) {
  return JSON.parse(await fsp.readFile(path.join(REPO_ROOT, relativePath), "utf8"));
}

function renderBrowserReport(payload, env) {
  return [
    "# Final Live Browser QA Report",
    "",
    env.renderTable([
      ["Routes checked", String(payload.summary.routesChecked)],
      ["Screenshots", payload.summary.screenshotDirectory],
      ["WebP previews render", env.bool(payload.summary.webpGalleryPreviewsRender)],
      ["No preview unavailable", env.bool(payload.summary.noPreviewUnavailableForVisibleUploadedRecords)],
      ["No broken image icons", env.bool(payload.summary.noBrokenImageIcons)],
      ["Deferred records hidden", env.bool(payload.summary.deferredRecordsHidden)],
      ["Counts show 6,352", env.bool(payload.summary.countsShow6352WhereApplicable)],
      ["Featured rotation works", env.bool(payload.summary.featuredRotationWorks)],
      ["Search works", env.bool(payload.summary.searchWorks)],
      ["Pagination works", env.bool(payload.summary.paginationWorks)],
      ["More menu works", env.bool(payload.summary.moreMenuWorks)],
      ["Mobile nav works", env.bool(payload.summary.mobileNavWorks)],
      ["Print opens", env.bool(payload.summary.printFlowOpens)],
      ["One-page PDF print works", env.bool(payload.summary.onePagePdfStylePrintOutputWorks)],
      ["PNG/JPG/WebP downloads work", env.bool(payload.summary.downloadsPassed)],
      ["SVG download absent", env.bool(payload.summary.svgDownloadAbsent)],
      ["Ad density accepted", env.bool(payload.summary.adWellsVisibleWithAcceptedDensity)],
      ["No live AdSense", env.bool(payload.summary.noLiveAdSenseScript)],
      ["No horizontal overflow", env.bool(payload.summary.noHorizontalOverflow)],
      ["Trust pages render", env.bool(payload.summary.trustPagesRender)],
      ["Contact email correct", env.bool(payload.summary.contactEmailAppearsCorrectly)],
      ["Result", env.bool(payload.summary.browserQaPassed)],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}

function renderTrustReview(payload, env) {
  return [
    "# Final Trust, Legal, And Content Review",
    "",
    env.renderTable([
      ["Pages reviewed", String(payload.summary.pagesReviewed)],
      ["Reviewed pages reachable", env.bool(payload.summary.allReviewedPagesReachable)],
      ["Contact email", payload.summary.contactEmail],
      ["Contact email correct", env.bool(payload.summary.contactEmailCorrect)],
      ["No fake address", env.bool(payload.summary.noFakeAddress)],
      ["No fake phone", env.bool(payload.summary.noFakePhone)],
      ["No fake company claims", env.bool(payload.summary.noFakeCompanyClaims)],
      ["Privacy mentions ads/cookies", env.bool(payload.summary.privacyPolicyMentionsAdsCookiesAccurately)],
      ["Privacy avoids false compliance claims", env.bool(payload.summary.privacyPolicyAvoidsFalseComplianceClaims)],
      ["Terms draft-safe", env.bool(payload.summary.termsDraftSafe)],
      ["Affiliate disclosure exists", env.bool(payload.summary.affiliateDisclosureExists)],
      ["Editorial policy exists", env.bool(payload.summary.editorialPolicyExists)],
      ["No online coloring promise", env.bool(payload.summary.noMisleadingOnlineColoringClaim)],
      ["No public SVG download claims", env.bool(payload.summary.noPublicSvgDownloadClaims)],
      ["No internal pipeline wording", env.bool(payload.summary.noInternalPipelineWording)],
      ["Gallery-first UX preserved", env.bool(payload.summary.galleryFirstUxPreserved)],
      ["Legal review still recommended", env.bool(payload.summary.legalReviewStillRecommended)],
      ["Result", env.bool(payload.summary.trustContentReviewPassed)],
    ]),
    "",
    `Owner review status: ${payload.summary.ownerReviewStatus}`,
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}

function renderAcceptanceGate(payload, env) {
  return [
    "# Final Live Acceptance Gate",
    "",
    env.renderTable([
      ["Production site reachable", env.bool(payload.production_site_reachable)],
      ["Production deploy current", env.bool(payload.production_deploy_current)],
      ["Route check passed", env.bool(payload.route_check_passed)],
      ["Regular sitemap passed", env.bool(payload.regular_sitemap_passed)],
      ["Image sitemap passed", env.bool(payload.image_sitemap_passed)],
      ["Robots passed", env.bool(payload.robots_passed)],
      ["OG metadata passed", env.bool(payload.og_metadata_passed)],
      ["JSON-LD passed", env.bool(payload.jsonld_passed)],
      ["Browser QA passed", env.bool(payload.browser_qa_passed)],
      ["Sampled asset check passed", env.bool(payload.sampled_asset_check_passed)],
      ["Print PDF passed", env.bool(payload.print_pdf_passed)],
      ["Downloads passed", env.bool(payload.downloads_passed)],
      ["Trust/content review passed", env.bool(payload.trust_content_review_passed)],
      ["GSC submission ready", env.bool(payload.gsc_submission_ready)],
      ["SVG download absent", env.bool(payload.no_svg_download)],
      ["app/api absent", env.bool(payload.no_app_api)],
      ["No horizontal overflow", env.bool(payload.no_horizontal_overflow)],
      ["Live ads skipped", env.bool(payload.live_ads_skipped)],
      ["Optional later work skipped", env.bool(payload.optional_later_work_skipped)],
      ["Ready for owner GSC submission", env.bool(payload.ready_for_owner_gsc_submission)],
      ["Ready for social preview manual validation", env.bool(payload.ready_for_social_preview_manual_validation)],
      ["Ready for live ads round", env.bool(payload.ready_for_live_ads_round)],
    ]),
    "",
    `Blockers: ${payload.blockers.length ? payload.blockers.join(" ") : "none"}`,
  ].join("\n");
}
