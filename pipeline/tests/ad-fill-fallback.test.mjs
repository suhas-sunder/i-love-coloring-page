import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const ROOT = process.cwd();
const coordinator = await importTypeScript("src/lib/ads/pageCoordinator.ts");

test("page coordinator starts pending and uses one documented 13-second timeout", () => {
  const { instance, transitions } = createRecorder();
  assert.equal(coordinator.AD_FALLBACK_TIMEOUT_MS, 13_000);
  assert.deepEqual(instance.getSnapshot(), {
    state: "pending",
    registeredUnitCount: 0,
    statuses: {},
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

test("filled and optimized results both suppress fallback globally", () => {
  for (const status of ["filled", "unfill-optimized"]) {
    const { instance } = createRecorder();
    instance.registerUnit("hub-header-banner");
    instance.registerUnit("rail-left-desktop");
    instance.reportStatus("rail-left-desktop", "unfilled");
    instance.reportStatus("hub-header-banner", status);
    assert.equal(instance.getSnapshot().state, "adsense-present", status);
    assert.equal(instance.getSnapshot().lastTransitionReason, status);
  }
});

test("late fill overrides fallback and AdSense-present is terminal for the lifecycle", () => {
  const { instance, transitions } = createRecorder();
  instance.registerUnit("hub-header-banner");
  instance.registerUnit("rail-left-desktop");
  instance.reportStatus("hub-header-banner", "unfilled");
  instance.reportStatus("rail-left-desktop", "unfilled");
  assert.equal(instance.getSnapshot().state, "fallback");
  instance.reportStatus("hub-header-banner", "filled");
  assert.equal(instance.getSnapshot().state, "adsense-present");
  instance.reportStatus("hub-header-banner", "unfilled");
  instance.reportTimeout();
  instance.reportFailure("script-failure");
  assert.equal(instance.getSnapshot().state, "adsense-present");
  assert.deepEqual(transitions.map((entry) => entry.state), ["fallback", "adsense-present"]);
});

test("script failure, initialization failure, and timeout activate fallback only without AdSense presence", () => {
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
  assert.equal(instance.getSnapshot().lastTransitionReason, "timeout");
});

test("disposed route coordinators ignore stale status, timeout, and failure callbacks", () => {
  const { instance, transitions } = createRecorder();
  instance.registerUnit("hub-header-banner");
  instance.dispose();
  instance.reportStatus("hub-header-banner", "filled");
  instance.reportTimeout();
  instance.reportFailure("script-failure");
  assert.equal(instance.getSnapshot().state, "pending");
  assert.deepEqual(transitions, []);

  const next = createRecorder();
  next.instance.registerUnit("hub-header-banner");
  next.instance.reportStatus("hub-header-banner", "unfilled");
  assert.equal(next.instance.getSnapshot().state, "fallback");
});

test("only official data-ad-status values are treated as fill evidence", () => {
  assert.equal(coordinator.readOfficialAdSenseStatus("filled"), "filled");
  assert.equal(coordinator.readOfficialAdSenseStatus("unfilled"), "unfilled");
  assert.equal(coordinator.readOfficialAdSenseStatus("unfill-optimized"), "unfill-optimized");
  assert.equal(coordinator.readOfficialAdSenseStatus("done"), null);
  assert.equal(coordinator.readOfficialAdSenseStatus(null), null);
});

test("runtime is environment-independent, route-scoped, and cleans observers and timers", async () => {
  const runtime = await read("src/components/ads/AdSenseRuntime.tsx");
  const script = await read("src/components/ads/AdSenseScript.tsx");
  const slot = await read("src/components/ads/AdSlot.tsx");
  const active = `${runtime}\n${script}\n${slot}`;
  assert.doesNotMatch(active, /process\.env|NODE_ENV|resolveAdMode|AdRuntimeEnvironment|ResolvedAdMode/);
  assert.match(runtime, /const pathname = usePathname\(\)/);
  assert.match(runtime, /\}, \[clientId, pathname\]\)/);
  assert.match(runtime, /attributeFilter: \["data-ad-status"\]/);
  assert.doesNotMatch(runtime, /data-adsbygoogle-status/);
  assert.match(runtime, /structureObserver\.disconnect\(\)/);
  assert.match(runtime, /statusObserver\.disconnect\(\)/);
  assert.match(runtime, /intersectionObserver\.disconnect\(\)/);
  assert.match(runtime, /clearTimeout\(fallbackTimer\)/);
  assert.match(runtime, /coordinator\.dispose\(\)/);
  assert.match(runtime, /unit\.dataset\.adInitialized = "true"/);
  assert.match(runtime, /unit\.dataset\.adInitialized === "true"/);
  assert.equal((runtime.match(/\.push\(\{\}\)/g) || []).length, 1);
});

test("slot markup contains one real unit plus a hidden neutral sibling fallback", async () => {
  const slot = await read("src/components/ads/AdSlot.tsx");
  assert.match(slot, /data-ad-fallback-policy="page-all-or-none-v1"/);
  assert.match(slot, /className="adsbygoogle ad-slot-live-unit"/);
  assert.match(slot, /data-ad-client=\{ADSENSE_CLIENT_ID\}/);
  assert.match(slot, /data-ad-format="auto"/);
  assert.match(slot, /data-full-width-responsive="true"/);
  assert.match(slot, /<div className="ad-slot-fallback" aria-label="Advertisement" data-ad-fallback="true" hidden>/);
  assert.doesNotMatch(slot, /<a\b|<button\b|tabIndex|Development placeholder|fake|creative|call to action/i);
  assert.ok(slot.indexOf("<ins") < slot.indexOf('data-ad-fallback="true" hidden'));
});

test("CSS directly suppresses sibling and page-wide fallbacks for official present states", async () => {
  const css = await read("src/styles/components.css");
  assert.match(css, /\.adsbygoogle\[data-ad-status="filled"\] ~ \[data-ad-fallback\]/);
  assert.match(css, /\.adsbygoogle\[data-ad-status="unfill-optimized"\] ~ \[data-ad-fallback\]/);
  assert.match(css, /\[data-ad-page-state="adsense-present"\] \[data-ad-fallback\]/);
  assert.match(css, /display: none !important/);
  assert.match(css, /\.ad-slot-fallback\[hidden\][\s\S]*display: none/);
  assert.doesNotMatch(css, /\.ad-slot-fallback[\s\S]{0,220}(?:position:\s*(?:absolute|fixed|sticky)|z-index|opacity:\s*0)/);
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
