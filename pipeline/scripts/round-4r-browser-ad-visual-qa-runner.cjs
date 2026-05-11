const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");

const { chromium } = requirePlaywright();

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MODE = process.env.ROUND4R_PLACEHOLDER_MODE || "off";
const BASE_URL = process.env.ROUND4R_APP_URL || "http://127.0.0.1:3005";

const PAGES = [
  "/",
  "/coloring-pages",
  "/coloring-pages/animals",
  "/coloring-pages/geometric",
  "/coloring-pages/anime-girls",
  "/coloring-pages/mandalas",
  "/coloring-pages/chibi",
  "/coloring-pages/fantasy",
  "/coloring-pages/christmas",
  "/coloring-pages/halloween",
  "/coloring-pages/plushies",
];

const VIEWPORTS = [
  { label: "desktop", width: 1280, height: 900, expectedVisibleSlots: 3 },
  { label: "wide-desktop", width: 1920, height: 1080, expectedVisibleSlots: 5 },
  { label: "tablet", width: 820, height: 1180, expectedVisibleSlots: 3 },
  { label: "mobile", width: 390, height: 844, expectedVisibleSlots: 3 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const screenshotRoot = path.join(
    REPO_ROOT,
    "pipeline",
    "review",
    "round-4r",
    "screenshots",
    MODE === "on" ? "ad-placeholders-on" : "ad-placeholders-off",
  );

  try {
    for (const pagePath of PAGES) {
      for (const viewport of VIEWPORTS) {
        await inspectPage(browser, pagePath, viewport, screenshotRoot);
      }
    }
  } finally {
    await browser.close();
  }
}

async function inspectPage(browser, pagePath, viewport, screenshotRoot) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const consoleIssues = [];
  const adRequests = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleIssues.push(message.text());
  });
  page.on("request", (request) => {
    if (/googlesyndication|doubleclick|adsbygoogle|googleadservices/i.test(request.url())) {
      adRequests.push(request.url());
    }
  });

  try {
    await page.goto(toUrl(pagePath), { waitUntil: "domcontentloaded" });
    await waitForRealMedia(page);
    await assertNoHorizontalOverflow(page);
    await assertNoForbiddenDownloadFormats(page);
    await assertNoForbiddenAdPlacements(page);

    if (MODE === "on") {
      await assertPlaceholderVisuals(page, pagePath, viewport);
    } else {
      assert.equal(await page.locator('[data-ad-placeholder="true"]').count(), 0, `${pagePath} should not render ad placeholders`);
      assert.equal(await page.getByText("Advertisement").count(), 0, `${pagePath} should not show ad placeholder labels`);
    }

    assert.deepEqual(adRequests, []);
    assert.deepEqual(consoleIssues.filter((issue) => !/favicon|Failed to load resource/i.test(issue)), []);

    await saveScreenshot(page, screenshotRoot, `${safePageName(pagePath)}-${viewport.label}.png`);
  } finally {
    await context.close();
  }
}

async function assertPlaceholderVisuals(page, pagePath, viewport) {
  const visibleSlots = page.locator('[data-ad-placeholder="true"]:visible');
  assert.equal(await visibleSlots.count(), viewport.expectedVisibleSlots, `${pagePath} should show expected slots at ${viewport.label}`);
  assert.equal(await page.locator(".ad-slot-label:visible").count(), viewport.expectedVisibleSlots, `${pagePath} should show readable Advertisement labels`);
  assert.equal(await page.getByText("Future ad slot").count(), 0, `${pagePath} should not show old secondary placeholder copy`);

  const visualState = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-ad-placeholder='true']")).filter((slot) => {
      const rect = slot.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).map((slot) => {
      const computed = window.getComputedStyle(slot);
      const pseudo = window.getComputedStyle(slot, "::before");
      const rect = slot.getBoundingClientRect();
      return {
        background: computed.backgroundImage,
        boxShadow: computed.boxShadow,
        borderStyle: computed.borderStyle,
        pseudoContent: pseudo.content,
        width: rect.width,
        height: rect.height,
      };
    });
  });

  assert.ok(visualState.every((slot) => slot.background === "none"), `${pagePath} should not use gradients`);
  assert.ok(visualState.every((slot) => slot.boxShadow === "none"), `${pagePath} should not use shadows`);
  assert.ok(visualState.every((slot) => slot.borderStyle === "none"), `${pagePath} should not use decorative borders`);
  assert.ok(visualState.every((slot) => slot.pseudoContent === "none" || slot.pseudoContent === "normal"), `${pagePath} should not draw pseudo-element accents`);
  assert.ok(visualState.every((slot) => slot.width > 0 && slot.height > 0), `${pagePath} slots should have measurable size`);

  await assertResponsiveAdSkeleton(page, pagePath, viewport);
}

async function assertResponsiveAdSkeleton(page, pagePath, viewport) {
  const headerSlotId = getHeaderSlotId(pagePath);
  const headerSlot = page.locator(`[data-ad-slot="${headerSlotId}"]:visible`);
  assert.equal(await headerSlot.count(), 1, `${pagePath} should show one visible header banner slot`);

  const headerPosition = await page.evaluate((slotId) => {
    const header = document.querySelector(".site-header")?.getBoundingClientRect();
    const slot = document.querySelector(`[data-ad-slot="${slotId}"]`)?.getBoundingClientRect();
    return header && slot ? { headerBottom: header.bottom, slotTop: slot.top } : null;
  }, headerSlotId);
  assert.ok(headerPosition, `${pagePath} should expose header and slot geometry`);
  assert.ok(headerPosition.slotTop >= headerPosition.headerBottom - 1, `${pagePath} header banner should sit below the nav`);

  if (viewport.label === "wide-desktop") {
    assert.equal(await page.locator('.ad-rail-left [data-ad-slot="rail-left-desktop"]:visible').count(), 1, `${pagePath} should show left rail on wide desktop`);
    assert.equal(await page.locator('.ad-rail-right [data-ad-slot="rail-right-desktop"]:visible').count(), 1, `${pagePath} should show right rail on wide desktop`);
    const railGaps = await page.evaluate(() => {
      const content = document.querySelector(".page-shell")?.getBoundingClientRect();
      const left = document.querySelector(".ad-rail-left")?.getBoundingClientRect();
      const right = document.querySelector(".ad-rail-right")?.getBoundingClientRect();
      return content && left && right
        ? { leftGap: content.left - left.right, rightGap: right.left - content.right, leftViewportGap: left.left, rightViewportGap: window.innerWidth - right.right }
        : null;
    });
    assert.ok(railGaps, `${pagePath} should expose rail geometry`);
    assert.ok(railGaps.leftGap >= 40, `${pagePath} left rail should keep a safe content gap`);
    assert.ok(railGaps.rightGap >= 40, `${pagePath} right rail should keep a safe content gap`);
    assert.ok(railGaps.leftViewportGap >= 0, `${pagePath} left rail should stay inside viewport`);
    assert.ok(railGaps.rightViewportGap >= 0, `${pagePath} right rail should not cover the scrollbar area`);
  } else {
    assert.equal(await page.locator(".ad-rail:visible").count(), 0, `${pagePath} should hide side rails at ${viewport.label}`);
  }
}

function toUrl(pagePath) {
  return `${BASE_URL}${pagePath}`;
}

function getHeaderSlotId(pagePath) {
  if (pagePath === "/") return "home-header-banner";
  if (pagePath === "/coloring-pages") return "coloring-pages-header-banner";
  return "hub-header-banner";
}

async function waitForRealMedia(page) {
  await page.waitForFunction(() => document.querySelectorAll("img.asset-image[data-state='loaded']").length > 0, null, { timeout: 15000 });
  assert.equal(await page.locator(".asset-placeholder").count(), 0);
}

async function assertNoHorizontalOverflow(page) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.equal(hasOverflow, false);
}

async function assertNoForbiddenDownloadFormats(page) {
  assert.equal(await page.getByText(/Download SVG|Download JPG|Download JPEG|Download WebP/i).count(), 0);
}

async function assertNoForbiddenAdPlacements(page) {
  assert.equal(await page.locator("header [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".hub-menu-panel [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".mobile-nav-panel [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".gallery-grid [data-ad-placeholder='true']").count(), 0);
  assert.equal(await page.locator(".gallery-actions [data-ad-placeholder='true']").count(), 0);
}

async function saveScreenshot(page, root, fileName) {
  await mkdir(root, { recursive: true });
  await page.screenshot({ path: path.join(root, fileName), fullPage: true });
}

function safePageName(pagePath) {
  if (pagePath === "/") return "home";
  return pagePath.replace(/^\//, "").replaceAll("/", "-");
}

main().then(
  () => {
    console.log(JSON.stringify({ mode: MODE, status: "passed" }, null, 2));
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);

function requirePlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }

  const executableNames = process.platform === "win32" ? ["playwright.cmd", "playwright.ps1", "playwright.exe"] : ["playwright"];
  for (const pathEntry of (process.env.PATH || "").split(path.delimiter)) {
    for (const executableName of executableNames) {
      const executablePath = path.join(pathEntry, executableName);
      if (!existsSync(executablePath)) continue;
      const packageRoot = path.resolve(pathEntry, "..", "playwright");
      if (existsSync(packageRoot)) return require(packageRoot);
    }
  }

  throw new Error("Playwright is not available. Run this script with npm exec --package=playwright -- node <script>.");
}
