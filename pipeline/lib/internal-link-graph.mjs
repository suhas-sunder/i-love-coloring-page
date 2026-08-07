import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

export const DEFAULT_SITE_URL = "https://www.ilovecoloringpage.com";

const STATIC_FILE_PATTERN = /(?:^\/_next\/|^\/search-data\/|^\/og\/|\.(?:css|js|mjs|cjs|json|xml|txt|svg|png|jpe?g|webp|gif|ico|woff2?)(?:$|[?#]))/i;
const PRIVATE_TARGET_PATTERN = /(?:^|[/:\\])(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?:[:/\\]|$)|(?:^|["'])[A-Za-z]:[\\/]|(?:^|["'])\\\\/i;
const MACHINE_PATH_PATTERN = /(?:^|["'])[A-Za-z]:[\\/]|(?:^|["'])\\\\|(?:^|\/)Users\/|(?:^|\/)PROJECTS-and-WORK\//i;
const INTERACTIVE_SCHEMES = new Set(["mailto:", "tel:"]);
const EXCLUDED_SCHEMES = new Set(["javascript:", "data:", "blob:"]);

export function analyzeInternalLinkGraph({
  rootDir = process.cwd(),
  outDir = path.join(rootDir, "out"),
  siteUrl = DEFAULT_SITE_URL,
  includeFullEvidence = false,
} = {}) {
  if (!existsSync(outDir)) {
    throw new Error(`Internal-link graph prerequisite missing: production output was not found at ${outDir}. Run the production build first.`);
  }

  const startedAt = performance.now();
  const startingHeap = process.memoryUsage().heapUsed;
  let observedHeap = startingHeap;
  const routeModel = loadRouteModel(rootDir);
  const outputs = discoverHtmlOutputs(outDir);
  const expectedRoutes = new Map(routeModel.routes.map((entry) => [entry.path, entry]));
  const nodes = [];
  const anchorEvidence = [];
  const canonicalFindings = [];
  const anchorFindings = [];
  let bytesScanned = 0;

  for (const output of outputs) {
    const html = readFileSync(output.filePath, "utf8");
    bytesScanned += Buffer.byteLength(html);
    const parsed = parseHtmlDocument(html, output.route);
    const expected = expectedRoutes.get(output.route);
    const family = expected?.family || classifyRouteFamily(output.route, routeModel.trustPaths);
    const indexable = output.route !== "/404" && !parsed.robots.some((value) => /\bnoindex\b/i.test(value));
    const expectedCanonical = output.route === "/404" ? null : absoluteUrl(output.route, siteUrl);
    if (expectedCanonical && parsed.canonicalLinks.length !== 1) {
      canonicalFindings.push(finding(output.route, "canonical-link-count", {
        expected: 1,
        actual: parsed.canonicalLinks.length,
      }));
    }
    if (expectedCanonical && parsed.canonical !== expectedCanonical) {
      canonicalFindings.push(finding(output.route, "canonical-mismatch", {
        expected: expectedCanonical,
        actual: parsed.canonical || "missing",
      }));
    }
    if (expected && expected.indexable !== indexable) {
      canonicalFindings.push(finding(output.route, "indexability-mismatch", {
        expected: expected.indexable,
        actual: indexable,
      }));
    }

    const node = {
      route: output.route,
      outputFile: normalizePath(path.relative(rootDir, output.filePath)),
      family,
      staticStatus: output.route === "/404" ? 404 : 200,
      indexable,
      canonical: parsed.canonical || null,
      h1: parsed.h1,
      ids: parsed.ids,
      visibleBreadcrumbs: parsed.breadcrumbs,
      structuredBreadcrumbs: parsed.structuredBreadcrumbs,
      anchorCount: parsed.anchors.length,
    };
    nodes.push(node);

    for (const anchor of parsed.anchors) {
      const normalized = normalizeInternalHref(anchor.href, output.route, siteUrl);
      const evidence = {
        source: output.route,
        href: anchor.href,
        normalizedTarget: normalized.target,
        kind: normalized.kind,
        region: anchor.region,
        text: anchor.text,
        accessibleName: anchor.accessibleName,
        hasQuery: normalized.hasQuery,
        hasHash: normalized.hasHash,
        hadTrailingSlash: normalized.hadTrailingSlash,
        absoluteHost: normalized.absoluteHost,
        noncanonicalOrigin: normalized.noncanonicalOrigin,
        invalidReason: normalized.invalidReason,
      };
      anchorEvidence.push(evidence);

      if (!anchor.accessibleName) anchorFindings.push(finding(output.route, "empty-accessible-anchor", evidence));
      if (anchor.nestedInteractive) anchorFindings.push(finding(output.route, "nested-interactive-anchor", evidence));
      if (PRIVATE_TARGET_PATTERN.test(anchor.href) || MACHINE_PATH_PATTERN.test(anchor.href)) {
        anchorFindings.push(finding(output.route, "private-or-machine-target", evidence));
      }
      if (normalized.kind === "invalid") anchorFindings.push(finding(output.route, "invalid-href", evidence));
      if (normalized.kind === "internal-route" && normalized.hasQuery) {
        anchorFindings.push(finding(output.route, "unsupported-query-state", evidence));
      }
      if (normalized.kind === "internal-route" && normalized.target?.endsWith("/page/1")) {
        anchorFindings.push(finding(output.route, "duplicate-page-one", evidence));
      }
      if (normalized.kind === "internal-route" && normalized.hadTrailingSlash && normalized.target !== "/") {
        anchorFindings.push(finding(output.route, "noncanonical-trailing-slash", evidence));
      }
      if (normalized.kind === "internal-route" && normalized.noncanonicalHost) {
        anchorFindings.push(finding(output.route, "noncanonical-host", evidence));
      }
      if (normalized.kind === "internal-route" && normalized.noncanonicalOrigin) {
        anchorFindings.push(finding(output.route, "noncanonical-origin", evidence));
      }
      if (normalized.kind === "static-file" && /(?:^|\/)svg(?:\/|$)|\.svg(?:$|[?#])/i.test(normalized.target || anchor.href)) {
        anchorFindings.push(finding(output.route, "public-svg-anchor", evidence));
      }
    }
    observedHeap = Math.max(observedHeap, process.memoryUsage().heapUsed);
  }

  nodes.sort((a, b) => a.route.localeCompare(b.route));
  anchorEvidence.sort(compareEvidence);
  const nodeByRoute = new Map(nodes.map((node) => [node.route, node]));
  const inventoryFindings = [];
  for (const expected of routeModel.routes) {
    if (!nodeByRoute.has(expected.path)) inventoryFindings.push(finding(expected.path, "missing-public-html-output", { family: expected.family }));
  }
  for (const node of nodes) {
    if (node.route !== "/404" && !expectedRoutes.has(node.route)) inventoryFindings.push(finding(node.route, "unexpected-public-html-output", { family: node.family }));
  }
  const internalAnchors = anchorEvidence.filter((edge) => edge.kind === "internal-route" && edge.normalizedTarget);
  const staticFileAnchors = anchorEvidence.filter((edge) => edge.kind === "static-file");
  const uniqueEdges = uniqueBy(internalAnchors, (edge) => `${edge.source}\u0000${edge.normalizedTarget}`);
  const brokenLinks = [];
  const fragmentFindings = [];
  for (const edge of internalAnchors) {
    if (!nodeByRoute.has(edge.normalizedTarget)) {
      brokenLinks.push(finding(edge.source, "broken-internal-link", edge));
      continue;
    }
    if (edge.hasHash) {
      const hash = safeHash(edge.href, edge.source, siteUrl);
      if (hash && hash !== "#" && !nodeByRoute.get(edge.normalizedTarget)?.ids.includes(decodeHash(hash))) {
        fragmentFindings.push(finding(edge.source, "missing-fragment-target", { ...edge, hash }));
      }
    }
    const targetCanonical = nodeByRoute.get(edge.normalizedTarget)?.canonical;
    if (targetCanonical && targetCanonical !== absoluteUrl(edge.normalizedTarget, siteUrl)) {
      canonicalFindings.push(finding(edge.source, "edge-target-canonicals-elsewhere", edge));
    }
  }

  const incoming = buildAdjacency(uniqueEdges, "normalizedTarget", "source");
  const outgoing = buildAdjacency(uniqueEdges, "source", "normalizedTarget");
  const depths = breadthFirstDepths(outgoing, "/");
  const sitemapOnlyRoutes = [];
  const orphanRoutes = [];
  const deadEnds = [];
  const globalRegions = new Set(["navigation", "footer"]);
  const meaningfulEdges = uniqueBy(
    internalAnchors.filter((edge) => edge.source !== "/sitemap" && edge.source !== edge.normalizedTarget),
    (edge) => `${edge.source}\u0000${edge.normalizedTarget}`,
  );
  const meaningfulIncoming = buildAdjacency(meaningfulEdges, "normalizedTarget", "source");
  const contentEdges = uniqueBy(
    internalAnchors.filter((edge) => !globalRegions.has(edge.region) && edge.source !== edge.normalizedTarget),
    (edge) => `${edge.source}\u0000${edge.normalizedTarget}`,
  );
  const contentOutgoing = buildAdjacency(contentEdges, "source", "normalizedTarget");

  for (const node of nodes.filter((entry) => entry.indexable && entry.route !== "/")) {
    const allSources = incoming.get(node.route) || new Set();
    if (allSources.size === 0) orphanRoutes.push(finding(node.route, "orphan-indexable-route", { family: node.family }));
    if (allSources.size > 0 && [...allSources].every((source) => source === "/sitemap")) {
      sitemapOnlyRoutes.push(finding(node.route, "weak-only-via-sitemap", { family: node.family }));
    }
    if (!depths.has(node.route)) orphanRoutes.push(finding(node.route, "unreachable-from-home", { family: node.family }));
    if ((contentOutgoing.get(node.route)?.size || 0) === 0 && !["html-sitemap", "trust-page"].includes(node.family)) {
      deadEnds.push(finding(node.route, "dead-end-route", { family: node.family }));
    }
  }

  const printableChecks = validatePrintables({ routeModel, nodeByRoute, anchorEvidence, meaningfulIncoming });
  const paginationChecks = validateHubPagination({ routeModel, nodeByRoute, anchorEvidence });
  const breadcrumbChecks = validateBreadcrumbs(nodes, siteUrl);
  const relatedChecks = validateRelatedLinks({ routeModel, nodeByRoute, anchorEvidence });
  const sitemapChecks = validateSitemaps({ rootDir, outDir, routeModel, nodeByRoute, siteUrl });
  const anchorTextFindings = validateAnchorText(anchorEvidence);
  const linkDensity = buildLinkDensity(nodes, anchorEvidence);
  const indexableDepths = nodes.filter((node) => node.indexable).map((node) => depths.get(node.route)).filter(Number.isFinite);
  const printableInboundValues = routeModel.printables.map((record) => meaningfulIncoming.get(record.canonicalPath)?.size || 0);
  const hubInboundValues = routeModel.hubs.filter(isPublicHub).map((hub) => meaningfulIncoming.get(hub.route)?.size || 0);
  const noncanonicalEdges = [...anchorFindings, ...canonicalFindings].filter((entry) => /canonical|query-state|page-one|trailing-slash|host/.test(entry.type));
  const allFindings = sortFindings([
    ...brokenLinks,
    ...fragmentFindings,
    ...orphanRoutes,
    ...sitemapOnlyRoutes,
    ...deadEnds,
    ...inventoryFindings,
    ...canonicalFindings,
    ...anchorFindings,
    ...printableChecks.findings,
    ...paginationChecks.findings,
    ...breadcrumbChecks.findings,
    ...relatedChecks.findings,
    ...sitemapChecks.findings,
    ...anchorTextFindings,
  ]);

  const completedAt = performance.now();
  observedHeap = Math.max(observedHeap, process.memoryUsage().heapUsed);
  const summary = {
    publicHtmlNodeCount: nodes.length,
    indexableNodeCount: nodes.filter((node) => node.indexable).length,
    physicalHtmlFileCount: discoverPhysicalHtmlFiles(outDir).length,
    htmlBytesScanned: bytesScanned,
    staticInternalEdgeCount: internalAnchors.length,
    uniqueInternalEdgeCount: uniqueEdges.length,
    duplicateInternalEdgeCount: internalAnchors.length - uniqueEdges.length,
    staticFileAnchorCount: staticFileAnchors.length,
    brokenLinkCount: brokenLinks.length + fragmentFindings.length,
    orphanIndexableCount: new Set(orphanRoutes.map((entry) => entry.source)).size,
    weakOnlyViaSitemapCount: sitemapOnlyRoutes.length,
    deadEndCount: deadEnds.length,
    routeInventoryFailureCount: inventoryFindings.length,
    noncanonicalEdgeCount: uniqueFindings(noncanonicalEdges).length,
    clientOnlyDiscoveryFindingCount: printableChecks.clientOnlyFindingCount,
    clickDepth: distribution(indexableDepths),
    printableInboundLinks: distribution(printableInboundValues),
    hubInboundLinks: distribution(hubInboundValues),
    paginationSequenceFailureCount: paginationChecks.findings.length,
    breadcrumbFailureCount: breadcrumbChecks.findings.length,
    relatedLinkFailureCount: relatedChecks.findings.length,
    htmlSitemapFailureCount: sitemapChecks.htmlFindings.length,
    xmlSitemapFailureCount: sitemapChecks.xmlFindings.length,
    imageSitemapFailureCount: sitemapChecks.imageFindings.length,
    anchorTextFailureCount: anchorTextFindings.length,
    printableCount: routeModel.printables.length,
    hubCount: routeModel.hubs.length,
    paginationRouteCount: routeModel.routes.filter((entry) => entry.family === "hub-pagination").length,
    runtimeMs: Number((completedAt - startedAt).toFixed(2)),
    approximatePeakHeapBytes: observedHeap,
    heapGrowthBytes: Math.max(0, observedHeap - startingHeap),
  };
  summary.passed = [
    summary.brokenLinkCount,
    summary.orphanIndexableCount,
    summary.weakOnlyViaSitemapCount,
    summary.deadEndCount,
    summary.routeInventoryFailureCount,
    summary.noncanonicalEdgeCount,
    summary.clientOnlyDiscoveryFindingCount,
    summary.paginationSequenceFailureCount,
    summary.breadcrumbFailureCount,
    summary.relatedLinkFailureCount,
    summary.htmlSitemapFailureCount,
    summary.xmlSitemapFailureCount,
    summary.imageSitemapFailureCount,
    summary.anchorTextFailureCount,
  ].every((count) => count === 0)
    && summary.printableCount === 6352
    && printableChecks.minimumMeaningfulInbound >= 1
    && printableChecks.missingPrimaryHubInboundCount === 0;

  return {
    version: 1,
    policy: "static-crawl-v1",
    summary,
    routeFamilies: countBy(nodes, (node) => node.family),
    maximumDepthRoutes: nodes
      .filter((node) => node.indexable && depths.get(node.route) === summary.clickDepth.maximum)
      .map((node) => node.route)
      .sort(),
    printableChecks: printableChecks.summary,
    paginationChecks: paginationChecks.summary,
    breadcrumbChecks: breadcrumbChecks.summary,
    relatedChecks: relatedChecks.summary,
    sitemapChecks: sitemapChecks.summary,
    graphDigests: {
      nodesSha256: digestLines(nodes.map((node) => `${node.route}\t${node.family}\t${node.indexable}\t${node.canonical || ""}`)),
      edgesSha256: digestLines(uniqueEdges.map((edge) => `${edge.source}\t${edge.normalizedTarget}`)),
      evidenceSha256: digestLines(anchorEvidence.map((edge) => `${edge.source}\t${edge.href}\t${edge.normalizedTarget || ""}\t${edge.region}\t${edge.accessibleName}`)),
    },
    linkDensity,
    findings: allFindings.slice(0, 250),
    ...(includeFullEvidence ? { nodes, edgeEvidence: anchorEvidence } : {}),
  };
}

export function parseHtmlDocument(html, sourceRoute = "/") {
  const tokens = tokenizeHtml(html);
  const stack = [];
  const anchors = [];
  const openAnchors = [];
  const openH1 = [];
  const openScripts = [];
  const ids = [];
  const robots = [];
  const breadcrumbs = [];
  const structuredBreadcrumbs = [];
  const canonicalLinks = [];
  let canonical = "";
  let h1 = "";

  for (const token of tokens) {
    if (token.type !== "tag") continue;
    if (token.closing) {
      if (token.name === "a") {
        const state = openAnchors.pop();
        if (state) anchors.push(finalizeAnchor(state, html, token.start, sourceRoute));
      } else if (token.name === "h1") {
        const state = openH1.pop();
        if (state && !h1) h1 = readableText(html.slice(state.contentStart, token.start));
      } else if (token.name === "script") {
        const state = openScripts.pop();
        if (state && /application\/ld\+json/i.test(state.attrs.type || "")) {
          const raw = decodeHtmlEntities(html.slice(state.contentStart, token.start).trim());
          try {
            const parsed = JSON.parse(raw);
            for (const list of findObjectsByType(parsed, "BreadcrumbList")) {
              structuredBreadcrumbs.push(list.itemListElement || []);
            }
          } catch {
            // JSON-LD parse errors are reported by the established SEO validators.
          }
        }
      }
      popStackTo(stack, token.name);
      continue;
    }

    if (token.attrs.id) ids.push(decodeHtmlEntities(token.attrs.id));
    if (token.name === "link" && relTokens(token.attrs.rel).includes("canonical")) {
      canonicalLinks.push(decodeHtmlEntities(token.attrs.href || ""));
      canonical ||= canonicalLinks.at(-1);
    }
    if (token.name === "meta" && /^(?:robots|googlebot)$/i.test(token.attrs.name || "")) robots.push(token.attrs.content || "");
    if (token.name === "a") {
      openAnchors.push({
        attrs: token.attrs,
        contentStart: token.end,
        ancestors: [...stack],
        nestedInteractive: openAnchors.length > 0,
      });
    }
    if (token.name === "h1") openH1.push({ contentStart: token.end });
    if (token.name === "script") openScripts.push({ attrs: token.attrs, contentStart: token.end });

    if (!token.selfClosing && !isVoidElement(token.name)) {
      stack.push({ name: token.name, attrs: token.attrs });
    }
  }

  for (const state of openAnchors) anchors.push(finalizeAnchor(state, html, html.length, sourceRoute));
  const visibleBreadcrumbAnchors = anchors.filter((anchor) => anchor.region === "breadcrumb");
  if (visibleBreadcrumbAnchors.length) {
    breadcrumbs.push(...visibleBreadcrumbAnchors.map((anchor) => ({ label: anchor.text || anchor.accessibleName, href: anchor.href })));
    const current = extractBreadcrumbCurrent(html);
    if (current) breadcrumbs.push({ label: current, href: null });
  }

  return {
    canonical,
    canonicalLinks,
    h1,
    ids: [...new Set(ids)].sort(),
    robots,
    anchors,
    breadcrumbs,
    structuredBreadcrumbs,
  };
}

export function tokenizeHtml(html) {
  const tokens = [];
  let cursor = 0;
  const rawTextElements = new Set(["script", "style", "textarea", "title"]);
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start < 0) break;
    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    let end = start + 1;
    let quote = "";
    while (end < html.length) {
      const char = html[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      end += 1;
    }
    if (end >= html.length) break;
    const raw = html.slice(start + 1, end);
    const parsed = parseTag(raw);
    if (parsed) tokens.push({ type: "tag", start, end: end + 1, raw: `<${raw}>`, ...parsed });
    cursor = end + 1;
    if (parsed && !parsed.closing && !parsed.selfClosing && rawTextElements.has(parsed.name)) {
      const closeStart = html.indexOf(`</${parsed.name}`, cursor);
      if (closeStart >= 0) cursor = closeStart;
    }
  }
  return tokens;
}

export function normalizeInternalHref(rawHref, sourceRoute = "/", siteUrl = DEFAULT_SITE_URL) {
  const href = decodeHtmlEntities(String(rawHref || "").trim());
  const base = new URL(sourceRoute || "/", `${siteUrl}/`);
  if (!href) return normalized("invalid", null, { invalidReason: "empty-href" });
  if (href.startsWith("#")) return normalized("internal-route", normalizeRoutePath(base.pathname), { hasHash: true });

  const lower = href.toLowerCase();
  const schemeMatch = lower.match(/^[a-z][a-z0-9+.-]*:/);
  if (schemeMatch && INTERACTIVE_SCHEMES.has(schemeMatch[0])) return normalized("contact", null);
  if (schemeMatch && EXCLUDED_SCHEMES.has(schemeMatch[0])) return normalized("excluded-protocol", null);

  let url;
  try {
    url = new URL(href, base);
  } catch (error) {
    return normalized("invalid", null, { invalidReason: error instanceof Error ? error.message : String(error) });
  }
  if (!/^https?:$/.test(url.protocol)) return normalized("external", null);

  const canonical = new URL(siteUrl);
  const internalHosts = new Set([canonical.host, canonical.host.replace(/^www\./, "")]);
  if (!internalHosts.has(url.host)) return normalized("external", null, { absoluteHost: url.host });

  let pathname;
  try {
    pathname = decodeURI(url.pathname.replace(/\\/g, "/"));
  } catch {
    return normalized("invalid", null, { invalidReason: "invalid-url-encoding", absoluteHost: url.host });
  }
  const hadTrailingSlash = pathname.length > 1 && /\/$/.test(pathname);
  const target = normalizeRoutePath(pathname);
  const details = {
    hasQuery: Boolean(url.search),
    hasHash: Boolean(url.hash),
    hadTrailingSlash,
    absoluteHost: /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") ? url.host : null,
    noncanonicalHost: url.host !== canonical.host,
    noncanonicalOrigin: url.origin !== canonical.origin,
  };
  if (STATIC_FILE_PATTERN.test(target)) return normalized("static-file", target, details);
  return normalized("internal-route", target, details);
}

function validatePrintables({ routeModel, nodeByRoute, anchorEvidence, meaningfulIncoming }) {
  const findings = [];
  let missingPrimaryHubInboundCount = 0;
  const approvedRegions = new Set(["gallery-card", "featured-card", "related", "content"]);
  const inboundByTarget = new Map();
  for (const edge of anchorEvidence) {
    if (edge.kind !== "internal-route" || !edge.normalizedTarget?.startsWith("/printables/")) continue;
    if (!approvedRegions.has(edge.region)) continue;
    const values = inboundByTarget.get(edge.normalizedTarget) || new Set();
    values.add(edge.source);
    inboundByTarget.set(edge.normalizedTarget, values);
  }
  for (const record of routeModel.printables) {
    if (!nodeByRoute.has(record.canonicalPath)) findings.push(finding(record.canonicalPath, "missing-printable-output"));
    const inbound = inboundByTarget.get(record.canonicalPath) || new Set();
    if (inbound.size === 0) findings.push(finding(record.canonicalPath, "printable-without-content-inbound"));
    const primaryHub = routeModel.hubById.get(record.primaryHubId);
    const expectedPage = primaryHub ? pageRouteForMember(primaryHub, record.assetId) : null;
    if (!expectedPage || !inbound.has(expectedPage)) {
      missingPrimaryHubInboundCount += 1;
      findings.push(finding(record.canonicalPath, "missing-primary-hub-card-link", { expectedSource: expectedPage }));
    }
    if ((meaningfulIncoming.get(record.canonicalPath)?.size || 0) === 0) {
      findings.push(finding(record.canonicalPath, "printable-orphan"));
    }
    for (const hubId of record.hubIds) {
      const hub = routeModel.hubById.get(hubId);
      if (!hub || !nodeByRoute.has(hub.route)) findings.push(finding(record.canonicalPath, "missing-member-hub-route", { hubId }));
    }
  }
  const values = routeModel.printables.map((record) => inboundByTarget.get(record.canonicalPath)?.size || 0);
  return {
    findings,
    minimumMeaningfulInbound: Math.min(...values),
    missingPrimaryHubInboundCount,
    clientOnlyFindingCount: findings.filter((entry) => /without-content-inbound|orphan/.test(entry.type)).length,
    summary: {
      printableCount: routeModel.printables.length,
      missingOutputCount: findings.filter((entry) => entry.type === "missing-printable-output").length,
      missingContentInboundCount: findings.filter((entry) => entry.type === "printable-without-content-inbound").length,
      missingPrimaryHubInboundCount,
      inboundContentSources: distribution(values),
    },
  };
}

function validateHubPagination({ routeModel, nodeByRoute, anchorEvidence }) {
  const findings = [];
  let checkedHubCount = 0;
  let checkedPageCount = 0;
  for (const hub of routeModel.hubs.filter((entry) => entry.route !== "/coloring-pages" && entry.indexable && entry.sitemap)) {
    checkedHubCount += 1;
    const totalPages = Math.max(1, Math.ceil(hub.assetIds.length / hub.galleryPageSize));
    const represented = [];
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      checkedPageCount += 1;
      const route = pageNumber === 1 ? hub.route : `${hub.route}/page/${pageNumber}`;
      if (!nodeByRoute.has(route)) {
        findings.push(finding(route, "missing-pagination-page", { hub: hub.slug, page: pageNumber }));
        continue;
      }
      const primaryCards = uniqueBy(anchorEvidence.filter((edge) => (
        edge.source === route
        && edge.region === "gallery-card"
        && edge.normalizedTarget?.startsWith("/printables/")
      )), (edge) => edge.normalizedTarget).map((edge) => edge.normalizedTarget);
      const expectedIds = hub.assetIds.slice((pageNumber - 1) * hub.galleryPageSize, pageNumber * hub.galleryPageSize);
      const expectedPaths = expectedIds.map((assetId) => routeModel.printableById.get(assetId)?.canonicalPath).filter(Boolean);
      if (!sameMembers(primaryCards, expectedPaths)) {
        findings.push(finding(route, "pagination-membership-mismatch", {
          expectedCount: expectedPaths.length,
          actualCount: primaryCards.length,
          missing: expectedPaths.filter((target) => !primaryCards.includes(target)).slice(0, 10),
          unexpected: primaryCards.filter((target) => !expectedPaths.includes(target)).slice(0, 10),
        }));
      }
      represented.push(...primaryCards);

      const paginationTargets = anchorEvidence.filter((edge) => edge.source === route && edge.region === "pagination").map((edge) => edge.normalizedTarget);
      const expectedTargets = [];
      if (pageNumber > 1) expectedTargets.push(pageNumber === 2 ? hub.route : `${hub.route}/page/${pageNumber - 1}`);
      if (pageNumber < totalPages) expectedTargets.push(`${hub.route}/page/${pageNumber + 1}`);
      if (!sameMembers([...new Set(paginationTargets)], expectedTargets)) {
        findings.push(finding(route, "pagination-link-mismatch", { expectedTargets, actualTargets: [...new Set(paginationTargets)] }));
      }
    }
    if (!sameMembers(represented, hub.assetIds.map((assetId) => routeModel.printableById.get(assetId)?.canonicalPath).filter(Boolean))) {
      findings.push(finding(hub.route, "hub-membership-sequence-mismatch", { hub: hub.slug }));
    }
  }
  return {
    findings,
    summary: { checkedHubCount, checkedPageCount, failureCount: findings.length },
  };
}

function validateBreadcrumbs(nodes, siteUrl) {
  const findings = [];
  let checkedCount = 0;
  for (const node of nodes.filter((entry) => ["hub-page-one", "hub-pagination", "printable-detail"].includes(entry.family))) {
    checkedCount += 1;
    const visible = node.visibleBreadcrumbs.map((entry) => ({
      label: normalizeText(entry.label),
      path: entry.href ? normalizeInternalHref(entry.href, node.route, siteUrl).target : node.route,
    }));
    const structured = (node.structuredBreadcrumbs[0] || []).map((entry) => ({
      label: normalizeText(entry?.name || ""),
      path: normalizeInternalHref(entry?.item || "", node.route, siteUrl).target,
    }));
    if (!visible.length) findings.push(finding(node.route, "missing-visible-breadcrumb"));
    if (!structured.length) findings.push(finding(node.route, "missing-structured-breadcrumb"));
    if (visible.length && structured.length && !sameBreadcrumbs(visible, structured)) {
      findings.push(finding(node.route, "visible-structured-breadcrumb-mismatch", { visible, structured }));
    }
  }
  return { findings, summary: { checkedCount, failureCount: findings.length } };
}

function validateRelatedLinks({ routeModel, nodeByRoute, anchorEvidence }) {
  const findings = [];
  let printableRegionCount = 0;
  for (const printable of routeModel.printables) {
    const edges = anchorEvidence.filter((edge) => edge.source === printable.canonicalPath && edge.region === "related" && edge.kind === "internal-route");
    const targets = edges.map((edge) => edge.normalizedTarget).filter(Boolean);
    if (targets.length) printableRegionCount += 1;
    for (const target of targets) {
      if (!nodeByRoute.has(target)) findings.push(finding(printable.canonicalPath, "broken-related-target", { target }));
      if (target === printable.canonicalPath) findings.push(finding(printable.canonicalPath, "self-related-target", { target }));
    }
    const uniqueTargets = new Set(targets);
    if (uniqueTargets.size !== targets.length / 2 && targets.length > 0) {
      // Image/title pairs are expected for printable cards; more than two anchors per target is not.
      const counts = countValues(targets);
      for (const [target, count] of Object.entries(counts)) {
        if (target.startsWith("/printables/") && count > 2) findings.push(finding(printable.canonicalPath, "duplicate-related-target", { target, count }));
        if (target.startsWith("/coloring-pages/") && count > 1) findings.push(finding(printable.canonicalPath, "duplicate-related-target", { target, count }));
      }
    }
  }
  return { findings, summary: { printableRegionCount, failureCount: findings.length } };
}

function validateSitemaps({ rootDir, outDir, routeModel, nodeByRoute, siteUrl }) {
  const findings = [];
  const htmlFindings = [];
  const xmlFindings = [];
  const imageFindings = [];
  const sitemapNode = nodeByRoute.get("/sitemap");
  const htmlTargets = new Set();
  if (!sitemapNode) htmlFindings.push(finding("/sitemap", "missing-html-sitemap"));
  else {
    const html = readFileSync(path.join(rootDir, sitemapNode.outputFile), "utf8");
    for (const anchor of parseHtmlDocument(html, "/sitemap").anchors) {
      const target = normalizeInternalHref(anchor.href, "/sitemap", siteUrl);
      if (target.kind === "internal-route" && target.target) htmlTargets.add(target.target);
    }
    for (const hub of routeModel.hubs.filter(isPublicHub)) {
      if (!htmlTargets.has(hub.route)) htmlFindings.push(finding("/sitemap", "missing-html-sitemap-hub", { target: hub.route }));
    }
  }

  const sitemapXml = readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
  const regularPaths = extractXmlLocs(sitemapXml).map((url) => normalizeInternalHref(url, "/", siteUrl).target);
  const expectedRegular = routeModel.routes.filter((entry) => entry.indexable && entry.includeInXmlSitemap).map((entry) => entry.path);
  if (!sameMembers(regularPaths, expectedRegular)) {
    xmlFindings.push(finding("/sitemap.xml", "regular-sitemap-membership-mismatch", {
      expectedCount: expectedRegular.length,
      actualCount: regularPaths.length,
      missing: expectedRegular.filter((entry) => !regularPaths.includes(entry)).slice(0, 20),
      unexpected: regularPaths.filter((entry) => !expectedRegular.includes(entry)).slice(0, 20),
    }));
  }

  const imageXml = readFileSync(path.join(outDir, "image-sitemap.xml"), "utf8");
  const imagePages = [...imageXml.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<image:loc>([^<]+)<\/image:loc>[\s\S]*?<\/url>/g)].map((match) => ({
    page: normalizeInternalHref(decodeXml(match[1]), "/", siteUrl).target,
    image: decodeXml(match[2]),
  }));
  if (imagePages.length !== routeModel.printables.length) imageFindings.push(finding("/image-sitemap.xml", "image-sitemap-count-mismatch", { actual: imagePages.length }));
  for (const pair of imagePages) {
    if (!nodeByRoute.has(pair.page)) imageFindings.push(finding("/image-sitemap.xml", "missing-image-page", pair));
    if (!/\.webp$/i.test(pair.image) || /\.svg(?:$|[?#])/i.test(pair.image)) imageFindings.push(finding("/image-sitemap.xml", "invalid-image-format", pair));
  }
  findings.push(...htmlFindings, ...xmlFindings, ...imageFindings);
  return {
    findings,
    htmlFindings,
    xmlFindings,
    imageFindings,
    summary: {
      htmlLinkCount: htmlTargets.size,
      regularSitemapUrlCount: regularPaths.length,
      imageSitemapPairCount: imagePages.length,
      failureCount: findings.length,
    },
  };
}

function validateAnchorText(anchorEvidence) {
  const findings = [];
  for (const edge of anchorEvidence.filter((entry) => entry.kind === "internal-route")) {
    const text = normalizeText(edge.accessibleName);
    if (!text) findings.push(finding(edge.source, "empty-anchor-name", edge));
    if (/^(?:click here|learn more|here)$/i.test(text)) findings.push(finding(edge.source, "generic-anchor-text", edge));
    if (/^[a-f0-9]{10,}$/i.test(text) || /(?:assetId|stableId|pipeline|\.webp|\.svg)/i.test(text)) findings.push(finding(edge.source, "internal-anchor-text-leak", edge));
  }
  return findings;
}

function buildLinkDensity(nodes, anchors) {
  const byRoute = new Map(nodes.map((node) => [node.route, []]));
  for (const anchor of anchors) byRoute.get(anchor.source)?.push(anchor);
  const families = new Map();
  for (const node of nodes) {
    const values = byRoute.get(node.route) || [];
    const family = families.get(node.family) || [];
    family.push({
      route: node.route,
      anchors: values.length,
      uniqueInternalTargets: new Set(values.filter((entry) => entry.kind === "internal-route").map((entry) => entry.normalizedTarget)).size,
      regions: countBy(values, (entry) => entry.region),
    });
    families.set(node.family, family);
  }
  return Object.fromEntries([...families.entries()].map(([family, rows]) => {
    const anchors = rows.map((row) => row.anchors);
    return [family, {
      routeCount: rows.length,
      anchorCount: distribution(anchors),
      largestRoutes: [...rows].sort((a, b) => b.anchors - a.anchors || a.route.localeCompare(b.route)).slice(0, 5),
    }];
  }));
}

function loadRouteModel(rootDir) {
  const printables = readJson(rootDir, "src/generated/coloring/runtime-printables.json").records;
  const hubs = readJson(rootDir, "src/generated/coloring/runtime-hubs.json").hubs;
  const runtimeRoutes = readJson(rootDir, "src/generated/coloring/runtime-routes.json").routes;
  const trustPaths = parseTrustPaths(readFileSync(path.join(rootDir, "src/lib/trust/trustPages.ts"), "utf8"));
  const printableById = new Map(printables.map((entry) => [entry.assetId, entry]));
  const hubById = new Map(hubs.map((entry) => [entry.hubId, entry]));
  const routes = [
    { path: "/", family: "home", indexable: true, includeInXmlSitemap: true },
    ...runtimeRoutes.map((entry) => ({
      path: entry.path,
      family: entry.path === "/coloring-pages" ? "main-gallery" : "hub-page-one",
      indexable: Boolean(entry.indexable),
      includeInXmlSitemap: Boolean(entry.indexable && entry.sitemap),
    })),
    ...hubs.filter((hub) => hub.route !== "/coloring-pages").flatMap((hub) => (
      Array.from({ length: Math.max(0, Math.ceil(hub.assetIds.length / hub.galleryPageSize) - 1) }, (_, index) => ({
        path: `${hub.route}/page/${index + 2}`,
        family: "hub-pagination",
        indexable: Boolean(hub.indexable),
        includeInXmlSitemap: false,
      }))
    )),
    ...printables.map((entry) => ({ path: entry.canonicalPath, family: "printable-detail", indexable: true, includeInXmlSitemap: true })),
    ...trustPaths.map((entry) => ({ path: entry, family: "trust-page", indexable: true, includeInXmlSitemap: true })),
    { path: "/sitemap", family: "html-sitemap", indexable: true, includeInXmlSitemap: true },
  ];
  return { printables, hubs, runtimeRoutes, trustPaths, printableById, hubById, routes };
}

function discoverHtmlOutputs(outDir) {
  const physical = discoverPhysicalHtmlFiles(outDir);
  const preferred = new Map();
  for (const filePath of physical) {
    const route = outputFileToRoute(outDir, filePath);
    if (!route) continue;
    const existing = preferred.get(route);
    if (!existing || path.basename(filePath).toLowerCase() === "404.html") preferred.set(route, { route, filePath });
  }
  return [...preferred.values()].sort((a, b) => a.route.localeCompare(b.route));
}

function discoverPhysicalHtmlFiles(outDir) {
  const files = [];
  const stack = [outDir];
  while (stack.length) {
    const directory = stack.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith(".html")) files.push(absolute);
    }
  }
  return files.sort();
}

function outputFileToRoute(outDir, filePath) {
  const relative = normalizePath(path.relative(outDir, filePath));
  if (relative === "index.html") return "/";
  if (relative === "404.html" || relative === "_not-found.html") return "/404";
  if (relative.startsWith("_next/")) return null;
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"/index.html".length)}`;
  return `/${relative.slice(0, -".html".length)}`;
}

function parseTag(raw) {
  let cursor = 0;
  while (/\s/.test(raw[cursor] || "")) cursor += 1;
  if (!raw[cursor] || raw[cursor] === "!" || raw[cursor] === "?") return null;
  const closing = raw[cursor] === "/";
  if (closing) cursor += 1;
  while (/\s/.test(raw[cursor] || "")) cursor += 1;
  const nameStart = cursor;
  while (/[A-Za-z0-9:-]/.test(raw[cursor] || "")) cursor += 1;
  if (cursor === nameStart) return null;
  const name = raw.slice(nameStart, cursor).toLowerCase();
  const attrs = {};
  while (cursor < raw.length) {
    while (/\s/.test(raw[cursor] || "")) cursor += 1;
    if (raw[cursor] === "/") { cursor += 1; continue; }
    const keyStart = cursor;
    while (cursor < raw.length && !/[\s=/>]/.test(raw[cursor])) cursor += 1;
    if (cursor === keyStart) { cursor += 1; continue; }
    const key = raw.slice(keyStart, cursor).toLowerCase();
    while (/\s/.test(raw[cursor] || "")) cursor += 1;
    let value = "";
    if (raw[cursor] === "=") {
      cursor += 1;
      while (/\s/.test(raw[cursor] || "")) cursor += 1;
      if (raw[cursor] === '"' || raw[cursor] === "'") {
        const quote = raw[cursor++];
        const valueStart = cursor;
        while (cursor < raw.length && raw[cursor] !== quote) cursor += 1;
        value = raw.slice(valueStart, cursor);
        if (raw[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < raw.length && !/[\s>]/.test(raw[cursor])) cursor += 1;
        value = raw.slice(valueStart, cursor).replace(/\/$/, "");
      }
    }
    if (!(key in attrs)) attrs[key] = decodeHtmlEntities(value);
  }
  return { name, attrs, closing, selfClosing: /\/\s*$/.test(raw) };
}

function finalizeAnchor(state, html, end, sourceRoute) {
  const inner = html.slice(state.contentStart, end);
  const text = readableText(inner);
  const imageAlt = tokenizeHtml(inner).filter((token) => token.name === "img" && !token.closing).map((token) => token.attrs.alt || "").filter(Boolean).join(" ");
  const accessibleName = normalizeText(state.attrs["aria-label"] || text || imageAlt || state.attrs.title || "");
  const anchor = {
    href: state.attrs.href || "",
    text,
    accessibleName,
    region: classifyAnchorRegion(state.ancestors, state.attrs, sourceRoute),
    nestedInteractive: state.nestedInteractive || /<(?:button|input|select|textarea)\b/i.test(inner),
  };
  return anchor;
}

function classifyAnchorRegion(ancestors, attrs, sourceRoute) {
  if (sourceRoute === "/sitemap") return "html-sitemap";
  const values = ancestors.map((entry) => `${entry.name} ${entry.attrs.class || ""} ${entry.attrs["aria-label"] || ""} ${entry.attrs["data-page-section"] || ""}`).join(" ").toLowerCase();
  const own = `${attrs.class || ""} ${attrs["data-page-section"] || ""}`.toLowerCase();
  if (/breadcrumb/.test(values)) return "breadcrumb";
  if (/site-header|site-nav|mobile-nav|header-disclosure|main navigation/.test(values)) return "navigation";
  if (/footer/.test(values) || ancestors.some((entry) => entry.name === "footer")) return "footer";
  if (/related/.test(values) || /related/.test(own)) return "related";
  if (/featured-printables|rotating-featured/.test(values)) return "featured-card";
  if (ancestors.some((entry) => entry.name === "nav" && /(?:^|\s)pagination(?:\s|$)/.test(entry.attrs.class || ""))) return "pagination";
  if (/gallery-grid|gallery-section|paginated-gallery/.test(values)) return "gallery-card";
  if (/hub-preview|hub-link-grid|collection-section|narrower-browse/.test(values)) return "collection-card";
  if (/return-to-collection|printable-facts|printable-heading/.test(values)) return "content";
  return "content";
}

function extractBreadcrumbCurrent(html) {
  const match = html.match(/<nav\b[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/nav>/i);
  if (!match) return "";
  const current = match[1].match(/<span\b[^>]*aria-current="page"[^>]*>([\s\S]*?)<\/span>/i);
  return current ? readableText(current[1]) : "";
}

function findObjectsByType(value, type, results = []) {
  if (Array.isArray(value)) {
    for (const entry of value) findObjectsByType(entry, type, results);
  } else if (value && typeof value === "object") {
    if (value["@type"] === type) results.push(value);
    for (const entry of Object.values(value)) findObjectsByType(entry, type, results);
  }
  return results;
}

function popStackTo(stack, name) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].name === name) {
      stack.splice(index);
      return;
    }
  }
}

function isVoidElement(name) {
  return new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]).has(name);
}

function relTokens(value = "") {
  return value.toLowerCase().split(/\s+/).filter(Boolean);
}

function readableText(value) {
  return normalizeText(decodeHtmlEntities(value.replace(/<[^>]*>/g, " ")));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRoutePath(value) {
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  const collapsed = withLeading.replace(/\/{2,}/g, "/");
  return collapsed !== "/" ? collapsed.replace(/\/+$/, "") : "/";
}

function normalized(kind, target, details = {}) {
  return {
    kind,
    target,
    hasQuery: false,
    hasHash: false,
    hadTrailingSlash: false,
    absoluteHost: null,
    noncanonicalHost: false,
    noncanonicalOrigin: false,
    invalidReason: null,
    ...details,
  };
}

function breadthFirstDepths(outgoing, start) {
  const depths = new Map([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    for (const target of outgoing.get(source) || []) {
      if (depths.has(target)) continue;
      depths.set(target, depths.get(source) + 1);
      queue.push(target);
    }
  }
  return depths;
}

function buildAdjacency(edges, fromKey, toKey) {
  const map = new Map();
  for (const edge of edges) {
    const from = edge[fromKey];
    const to = edge[toKey];
    if (!from || !to) continue;
    const values = map.get(from) || new Set();
    values.add(to);
    map.set(from, values);
  }
  return map;
}

function distribution(values) {
  if (!values.length) return { minimum: 0, median: 0, p90: 0, p95: 0, maximum: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    minimum: sorted[0],
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    maximum: sorted.at(-1),
  };
}

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * value) - 1))];
}

function pageRouteForMember(hub, assetId) {
  const index = hub.assetIds.indexOf(assetId);
  if (index < 0) return null;
  const page = Math.floor(index / hub.galleryPageSize) + 1;
  return page === 1 ? hub.route : `${hub.route}/page/${page}`;
}

function sameMembers(left, right) {
  return left.length === right.length && new Set(left).size === left.length && new Set(right).size === right.length && left.every((entry) => right.includes(entry));
}

function sameBreadcrumbs(left, right) {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry.label === right[index].label && entry.path === right[index].path);
}

function safeHash(href, sourceRoute, siteUrl) {
  try { return new URL(href, new URL(sourceRoute, `${siteUrl}/`)).hash; } catch { return ""; }
}

function decodeHash(hash) {
  try { return decodeURIComponent(hash.slice(1)); } catch { return hash.slice(1); }
}

function absoluteUrl(route, siteUrl) {
  return route === "/" ? siteUrl : `${siteUrl}${route}`;
}

function extractXmlLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1]));
}

function decodeXml(value) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x27|39);/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&nbsp;/g, " ");
}

function parseTrustPaths(source) {
  return [...source.matchAll(/path:\s*"([^"]+)"[\s\S]*?indexable:\s*true/g)].map((match) => match[1]);
}

function classifyRouteFamily(route, trustPaths) {
  if (route === "/") return "home";
  if (route === "/coloring-pages") return "main-gallery";
  if (/^\/coloring-pages\/[^/]+\/page\/(?:[2-9]|[1-9]\d+)$/.test(route)) return "hub-pagination";
  if (/^\/coloring-pages\/[^/]+$/.test(route)) return "hub-page-one";
  if (route.startsWith("/printables/")) return "printable-detail";
  if (route === "/sitemap") return "html-sitemap";
  if (route === "/404") return "not-found";
  if (trustPaths.includes(route)) return "trust-page";
  return "other-html";
}

function isPublicHub(hub) {
  return Boolean(hub.route && hub.indexable && hub.sitemap);
}

function finding(source, type, evidence = {}) {
  return { source, type, ...evidence };
}

function sortFindings(findings) {
  return uniqueFindings(findings).sort((a, b) => a.type.localeCompare(b.type) || a.source.localeCompare(b.source) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function uniqueFindings(findings) {
  return uniqueBy(findings, (entry) => JSON.stringify(entry));
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function countValues(values) {
  return countBy(values, (entry) => entry);
}

function compareEvidence(left, right) {
  return left.source.localeCompare(right.source)
    || String(left.normalizedTarget).localeCompare(String(right.normalizedTarget))
    || left.region.localeCompare(right.region)
    || left.href.localeCompare(right.href)
    || left.accessibleName.localeCompare(right.accessibleName);
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function readJson(rootDir, relativePath) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function digestLines(lines) {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
