const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const path = require("node:path");

const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MODE = process.env.ROUND4Q_PLACEHOLDER_MODE || "off";
const BASE_URL = process.env.ROUND4Q_APP_URL || "http://localhost:3005";

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
  { label: "desktop", width: 1280, height: 900 },
  { label: "wide-desktop", width: 1920, height: 1080 },
  { label: "tablet", width: 820, height: 1180 },
  { label: "mobile", width: 390, height: 844 },
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const screenshotRoot = path.join(
    REPO_ROOT,
    "pipeline",
    "review",
    "round-4q",
    "screenshots",
    MODE === "on" ? "ad-placeholders-on" : "ad-placeholders-off",
  );

  try {
    for (const pagePath of PAGES) {
      for (const viewport of VIEWPORTS) {
        await inspectPage(browser, pagePath, viewport, screenshotRoot);
      }
    }

    if (MODE === "on") {
      await inspectDesktopMoreMenu(browser);
      await inspectMobileNav(browser);
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
      assert.ok(await page.locator('[data-ad-placeholder="true"]:visible').count() > 0, `${pagePath} should show an ad placeholder`);
      assert.ok(await page.locator(".ad-slot-label:visible").count() > 0, `${pagePath} should show Advertisement label`);
      await assertResponsiveAdSkeleton(page, pagePath, viewport);
    } else {
      assert.equal(await page.locator('[data-ad-placeholder="true"]').count(), 0, `${pagePath} should not render ad placeholders`);
      assert.equal(await page.getByText("Future ad slot").count(), 0, `${pagePath} should not show placeholder copy`);
    }

    assert.deepEqual(adRequests, []);
    assert.deepEqual(consoleIssues.filter((issue) => !/favicon|Failed to load resource/i.test(issue)), []);

    await saveScreenshot(page, screenshotRoot, `${safePageName(pagePath)}-${viewport.label}.png`);
  } finally {
    await context.close();
  }
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

async function inspectDesktopMoreMenu(browser) {
  const context = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(toUrl("/coloring-pages"), { waitUntil: "domcontentloaded" });
    await waitForRealMedia(page);

    const moreButton = page.getByRole("button", { name: "More", exact: true });
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");
    await moreButton.click();
    assert.equal(await moreButton.getAttribute("aria-expanded"), "true");
    assert.ok(await page.getByLabel("Search hub pages").isVisible());
    assert.equal(await page.locator(".hub-menu-panel [data-ad-placeholder='true']").count(), 0);
    await saveScreenshot(page, path.join(REPO_ROOT, "pipeline", "review", "round-4q", "screenshots", "nav-desktop"), "more-menu-open-wide.png");

    await page.getByLabel("Search hub pages").fill("geometric");
    const desktopMenu = page.locator(".hub-menu-panel-desktop");
    const geometricLink = desktopMenu.getByRole("link", { name: /Geometric/i });
    assert.equal(await geometricLink.count(), 1);
    assert.ok(await geometricLink.isVisible());
    await saveScreenshot(page, path.join(REPO_ROOT, "pipeline", "review", "round-4q", "screenshots", "nav-desktop"), "more-menu-search-geometric.png");

    await moreButton.click();
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");

    await moreButton.click();
    await page.keyboard.press("Escape");
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");

    await moreButton.click();
    await page.mouse.click(20, 20);
    assert.equal(await moreButton.getAttribute("aria-expanded"), "false");

    await moreButton.click();
    await page.getByLabel("Search hub pages").fill("geometric");
    await page.locator(".hub-menu-panel-desktop a[href*='/coloring-pages/geometric']").click();
    await page.waitForURL(/\/coloring-pages\/geometric\/?$/);
  } finally {
    await context.close();
  }
}

async function inspectMobileNav(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(toUrl("/coloring-pages"), { waitUntil: "domcontentloaded" });
    await waitForRealMedia(page);

    const openButton = page.getByRole("button", { name: "Open navigation menu" });
    assert.equal(await openButton.getAttribute("aria-expanded"), "false");
    await openButton.click();
    const closeButton = page.getByRole("button", { name: "Close navigation menu" });
    assert.equal(await closeButton.getAttribute("aria-expanded"), "true");
    assert.ok(await page.getByLabel("Search mobile hub pages").isVisible());
    assert.equal(await page.locator(".mobile-nav-panel [data-ad-placeholder='true']").count(), 0);
    await saveScreenshot(page, path.join(REPO_ROOT, "pipeline", "review", "round-4q", "screenshots", "nav-mobile"), "mobile-menu-open.png");

    await page.getByLabel("Search mobile hub pages").fill("mandalas");
    const mandalasLink = page.locator(".mobile-nav-panel a[href*='/coloring-pages/mandalas']");
    assert.equal(await mandalasLink.count(), 1);
    assert.ok(await mandalasLink.isVisible());
    await saveScreenshot(page, path.join(REPO_ROOT, "pipeline", "review", "round-4q", "screenshots", "nav-mobile"), "mobile-menu-search-mandalas.png");

    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Open navigation menu" }).getAttribute("aria-expanded"), "false");

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.mouse.click(12, 820);
    assert.equal(await page.getByRole("button", { name: "Open navigation menu" }).getAttribute("aria-expanded"), "false");

    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.getByLabel("Search mobile hub pages").fill("chibi");
    await page.locator(".mobile-nav-panel a[href='/coloring-pages/chibi/']").click();
    await page.waitForURL(/\/coloring-pages\/chibi\/?$/);
  } finally {
    await context.close();
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
