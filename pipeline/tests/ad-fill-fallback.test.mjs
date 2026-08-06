import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const coordinator = await importTypeScript("src/lib/ads/pageCoordinator.ts");
const creativeEvidence = await importTypeScript("src/lib/ads/creativeEvidence.ts");
const railLayout = await importTypeScript("src/lib/ads/layout.ts");

test("page coordinator starts pending and uses centralized script and unresolved timers", () => {
  const { instance, transitions } = createRecorder();
  assert.equal(coordinator.AD_SCRIPT_AVAILABILITY_GRACE_MS, 4_000);
  assert.equal(coordinator.AD_FALLBACK_TIMEOUT_MS, 13_000);
  assert.deepEqual(instance.getSnapshot(), {
    state: "pending",
    registeredUnitCount: 0,
    statuses: {},
    visibleAdSenseContent: {},
    lastTransitionReason: null,
  });
  assert.deepEqual(transitions, []);
});

test("all initialized units reporting unfilled activates one global fallback state", () => {
  const { instance, transitions } = createRecorder();
  assert.equal(instance.registerUnit("hub-header-banner"), true);
  assert.equal(instance.registerUnit("rail-left-desktop"), true);
  assert.equal(instance.registerUnit("rail-left-desktop"), false);
  instance.reportStatus("hub-header-banner", "unfilled");
  assert.equal(instance.getSnapshot().state, "pending");
  instance.reportStatus("rail-left-desktop", "unfilled");
  assert.equal(instance.getSnapshot().state, "fallback");
  assert.deepEqual(transitions.map((entry) => entry.state), ["fallback"]);
  assert.equal(transitions[0].lastTransitionReason, "all-initialized-unfilled");
});

test("raw filled and optimized statuses do not suppress fallbacks without visible creative evidence", () => {
  for (const status of ["filled", "unfill-optimized"]) {
    const { instance } = createRecorder();
    instance.registerUnit("hub-header-banner");
    instance.reportStatus("hub-header-banner", status, false);
    assert.equal(instance.getSnapshot().state, "pending", status);
    assert.equal(instance.getSnapshot().visibleAdSenseContent["hub-header-banner"], false);
    instance.reportTimeout();
    assert.equal(instance.getSnapshot().state, "fallback", status);
  }
});

test("verified filled and optimized surfaces both suppress every fallback globally", () => {
  for (const status of ["filled", "unfill-optimized"]) {
    const { instance } = createRecorder();
    instance.registerUnit("hub-header-banner");
    instance.registerUnit("rail-left-desktop");
    instance.reportStatus("rail-left-desktop", "unfilled");
    instance.reportStatus("hub-header-banner", status, true);
    assert.equal(instance.getSnapshot().state, "adsense-present", status);
    assert.equal(instance.getSnapshot().lastTransitionReason, status);
    assert.equal(instance.getSnapshot().visibleAdSenseContent["hub-header-banner"], true);
  }
});

test("late verified fill overrides fallback and AdSense-present is terminal for the route lifecycle", () => {
  const { instance, transitions } = createRecorder();
  instance.registerUnit("hub-header-banner");
  instance.registerUnit("rail-left-desktop");
  instance.reportStatus("hub-header-banner", "unfilled");
  instance.reportStatus("rail-left-desktop", "unfilled");
  assert.equal(instance.getSnapshot().state, "fallback");
  instance.reportStatus("hub-header-banner", "filled", true);
  assert.equal(instance.getSnapshot().state, "adsense-present");
  instance.reportStatus("hub-header-banner", "unfilled");
  instance.reportTimeout();
  instance.reportFailure("script-failure");
  assert.equal(instance.getSnapshot().state, "adsense-present");
  assert.deepEqual(transitions.map((entry) => entry.state), ["fallback", "adsense-present"]);
});

test("script failure, initialization failure, and timeout activate stable fallback without verified content", () => {
  for (const reason of ["script-failure", "initialization-failure"]) {
    const { instance } = createRecorder();
    instance.registerUnit("hub-header-banner");
    instance.reportFailure(reason);
    assert.equal(instance.getSnapshot().state, "fallback");
    assert.equal(instance.getSnapshot().lastTransitionReason, reason);
  }
  const { instance } = createRecorder();
  instance.registerUnit("hub-header-banner");
  instance.reportTimeout();
  assert.equal(instance.getSnapshot().state, "fallback");
});

test("disposed route coordinators ignore stale status, timeout, and failure callbacks", () => {
  const { instance, transitions } = createRecorder();
  instance.registerUnit("hub-header-banner");
  instance.dispose();
  instance.reportStatus("hub-header-banner", "filled", true);
  instance.reportTimeout();
  instance.reportFailure("script-failure");
  assert.equal(instance.getSnapshot().state, "pending");
  assert.deepEqual(transitions, []);

  const next = createRecorder();
  next.instance.registerUnit("hub-header-banner");
  next.instance.reportStatus("hub-header-banner", "unfilled");
  assert.equal(next.instance.getSnapshot().state, "fallback");
});

test("only official data-ad-status values are status evidence", () => {
  assert.equal(coordinator.readOfficialAdSenseStatus("filled"), "filled");
  assert.equal(coordinator.readOfficialAdSenseStatus("unfilled"), "unfilled");
  assert.equal(coordinator.readOfficialAdSenseStatus("unfill-optimized"), "unfill-optimized");
  assert.equal(coordinator.readOfficialAdSenseStatus("done"), null);
  assert.equal(coordinator.readOfficialAdSenseStatus(null), null);
});

test("creative evidence requires a visible unit and nonzero Google-managed iframe", () => {
  const visibleGoogleFrame = fakeElement({ width: 300, height: 250, src: "https://googleads.g.doubleclick.net/pagead/ads" });
  const emptyGoogleFrame = fakeElement({ width: 0, height: 0, src: "https://googleads.g.doubleclick.net/pagead/ads" });
  const unrelatedFrame = fakeElement({ width: 300, height: 250, src: "https://example.com/frame" });
  const styleReader = (element) => ({ display: element.display || "block", visibility: element.visibility || "visible" });
  assert.equal(creativeEvidence.hasVisibleAdSenseOwnedSurface(fakeUnit([visibleGoogleFrame]), styleReader), true);
  assert.equal(creativeEvidence.hasVisibleAdSenseOwnedSurface(fakeUnit([emptyGoogleFrame]), styleReader), false);
  assert.equal(creativeEvidence.hasVisibleAdSenseOwnedSurface(fakeUnit([unrelatedFrame]), styleReader), false);
  assert.equal(creativeEvidence.hasVisibleAdSenseOwnedSurface(fakeUnit([]), styleReader), false);
  assert.equal(creativeEvidence.isGoogleManagedFrameSource("https://tpc.googlesyndication.com/safeframe"), true);
  assert.equal(creativeEvidence.isGoogleManagedFrameSource("about:blank"), false);
});

test("rail eligibility uses measured 300 by 600 gutters at the 2400px threshold", () => {
  assert.deepEqual(railLayout.AD_RAIL_LAYOUT, {
    minViewportWidth: 2400,
    width: 300,
    height: 600,
    contentGap: 24,
    outerPadding: 16,
    topOffset: 112,
  });
  assert.equal(railLayout.measureAdRailLayout(2399, { left: 580, right: 1819 }).eligible, false);
  assert.equal(railLayout.measureAdRailLayout(2400, { left: 580, right: 1820 }).eligible, true);
  assert.equal(railLayout.measureAdRailLayout(3440, { left: 1100, right: 2340 }).eligible, true);
  assert.equal(railLayout.measureAdRailLayout(2560, { left: 330, right: 2230 }).eligible, false);
});

test("runtime is environment-independent, route-scoped, measured, and fully cleaned up", async () => {
  const runtime = await read("src/components/ads/AdSenseRuntime.tsx");
  const script = await read("src/components/ads/AdSenseScript.tsx");
  const slot = await read("src/components/ads/AdSlot.tsx");
  const active = `${runtime}\n${script}\n${slot}`;
  assert.doesNotMatch(active, /process\.env|NODE_ENV|resolveAdMode|AdRuntimeEnvironment|ResolvedAdMode/);
  assert.match(runtime, /const pathname = usePathname\(\)/);
  assert.match(runtime, /\}, \[clientId, pathname\]\)/);
  assert.match(runtime, /attributeFilter: \["data-ad-status"\]/);
  assert.doesNotMatch(runtime, /data-adsbygoogle-status/);
  assert.match(runtime, /hasVisibleAdSenseOwnedSurface\(unit\)/);
  assert.match(runtime, /measureAdRailLayout/);
  assert.match(runtime, /syncFixedHeaderSizes/);
  assert.match(runtime, /AD_SCRIPT_AVAILABILITY_GRACE_MS/);
  assert.match(runtime, /AD_FALLBACK_TIMEOUT_MS/);
  assert.match(runtime, /structureObserver\.disconnect\(\)/);
  assert.match(runtime, /statusObserver\.disconnect\(\)/);
  assert.match(runtime, /intersectionObserver\.disconnect\(\)/);
  assert.match(runtime, /resizeObserver\.disconnect\(\)/);
  assert.match(runtime, /removeEventListener\("orientationchange"/);
  assert.match(runtime, /cancelAnimationFrame\(layoutFrame\)/);
  assert.match(runtime, /cancelAnimationFrame\(reviewFrame\)/);
  assert.match(runtime, /MAX_INITIALIZATION_MEASUREMENT_RETRIES = 8/);
  assert.match(runtime, /getClientRects\(\)\.length > 0/);
  assert.match(runtime, /hasRequiredAdSurfaceSize/);
  assert.match(runtime, /resizeObserver\.observe\(wrapper\)/);
  assert.match(runtime, /initializationRetryFrames\.values\(\)/);
  assert.match(runtime, /coordinator\.dispose\(\)/);
  assert.match(runtime, /unit\.dataset\.adInitialized = "true"/);
  assert.match(runtime, /unit\.dataset\.adInitialized === "true"/);
  assert.equal((runtime.match(/\.push\(\{\}\)/g) || []).length, 1);
});

test("slot markup separates fixed header policy from auto units and provides a neutral sibling fallback", async () => {
  const slot = await read("src/components/ads/AdSlot.tsx");
  assert.match(slot, /data-ad-fallback-policy="page-all-or-none-v1"/);
  assert.match(slot, /className="adsbygoogle ad-slot-live-unit"/);
  assert.match(slot, /data-ad-client=\{ADSENSE_CLIENT_ID\}/);
  assert.match(slot, /data-ad-format=\{isFixedHeader \? undefined : "auto"\}/);
  assert.match(slot, /data-full-width-responsive=\{isFixedHeader \? undefined : "true"\}/);
  assert.match(slot, /data-ad-size-policy=\{isFixedHeader \? "fixed-header-v1" : undefined\}/);
  assert.match(slot, /data-ad-fixed-width=\{isFixedHeader \? "728" : undefined\}/);
  assert.match(slot, /data-ad-flow-version=\{slot\.logicalPlacement === "post-header-banner" \? "balanced-mid-content-v1" : undefined\}/);
  assert.match(slot, /className="ad-slot-fallback" aria-hidden="true" data-ad-fallback="true" hidden/);
  assert.match(slot, /className="ad-slot-fallback-lines"/);
  assert.doesNotMatch(slot, /<a\b|<button\b|tabIndex|fake advertiser|creative|call to action/i);
  assert.ok(slot.indexOf("<ins") < slot.indexOf('data-ad-fallback="true" hidden'));
});

test("CSS keeps fallbacks mutually exclusive, stable, non-overlay, and hidden in print", async () => {
  const css = await read("src/styles/components.css");
  assert.match(css, /\.adsbygoogle\[data-ad-status="filled"\] ~ \[data-ad-fallback\]/);
  assert.match(css, /\.adsbygoogle\[data-ad-status="unfill-optimized"\] ~ \[data-ad-fallback\]/);
  assert.match(css, /\[data-ad-page-state="adsense-present"\] \[data-ad-fallback\]/);
  assert.match(css, /display: none !important/);
  assert.match(css, /\.ad-slot-fallback\[hidden\][\s\S]*display: none/);
  assert.match(css, /@media print[\s\S]*\.ad-slot,[\s\S]*\.ad-rail[\s\S]*display: none !important/);
  assert.doesNotMatch(css, /\.ad-slot-fallback[\s\S]{0,300}(?:position:\s*(?:absolute|fixed|sticky)|z-index|opacity:\s*0|transition)/);
});

test("configuration and ads.txt retain the exact confirmed public values", async () => {
  const config = await read("src/lib/ads/config.ts");
  const adsTxt = await read("public/ads.txt");
  assert.equal(adsTxt, "google.com, pub-4810616735714570, DIRECT, f08c47fec0942fa0");
  assert.match(config, /ADSENSE_CLIENT_ID = "ca-pub-4810616735714570"/);
  for (const id of ["5574432869", "5115981872", "9929324856", "2489818539", "5382861174"]) {
    assert.match(config, new RegExp(id));
  }
});

function createRecorder() {
  const transitions = [];
  const instance = coordinator.createAdPageCoordinator((snapshot) => transitions.push(snapshot));
  return { instance, transitions };
}

function fakeUnit(frames) {
  return {
    display: "block",
    visibility: "visible",
    getBoundingClientRect: () => ({ width: 728, height: 90 }),
    querySelectorAll: () => frames,
  };
}

function fakeElement({ width, height, src }) {
  return {
    display: "block",
    visibility: "visible",
    getAttribute: (name) => name === "src" ? src : null,
    getBoundingClientRect: () => ({ width, height }),
  };
}

async function read(relativePath) {
  return readFile(path.join(ROOT, relativePath), "utf8");
}

async function importTypeScript(relativePath) {
  const source = await read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}#${encodeURIComponent(relativePath)}`);
}
