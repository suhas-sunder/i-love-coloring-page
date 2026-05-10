import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENABLED = process.env.COLORING_ENABLE_LOCAL_ASSET_PROXY === "1";
const ALLOWED_TOP_LEVEL_FOLDERS = new Set(["svg", "png", "thumbs"]);
const ASSET_ROOT_PARTS = ["pipeline", "production", "full", "assets"];

type AssetRouteContext = {
  params: Promise<{ path?: string[] }>;
};

export async function GET(_request: NextRequest, context: AssetRouteContext) {
  if (!ENABLED) {
    return NextResponse.json({ error: "Local coloring asset proxy is disabled" }, { status: 404 });
  }

  const { path: requestedPath = [] } = await context.params;
  const safeSegments = sanitizeSegments(requestedPath);
  if (!safeSegments) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  const assetRoot = getAssetRoot();
  const target = path.resolve(assetRoot, ...safeSegments);
  if (!target.startsWith(`${assetRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  try {
    const bytes = await readFile(target);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentTypeFor(target),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}

function getAssetRoot() {
  const configuredRoot = process.env.COLORING_LOCAL_ASSET_ROOT;
  return configuredRoot
    ? path.resolve(/*turbopackIgnore: true*/ configuredRoot)
    : path.resolve(/*turbopackIgnore: true*/ process.cwd(), ...ASSET_ROOT_PARTS);
}

function sanitizeSegments(segments: string[]) {
  if (segments.length < 2) return null;
  if (!ALLOWED_TOP_LEVEL_FOLDERS.has(segments[0])) return null;
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes(":") || segment.includes("\\"))) {
    return null;
  }
  return segments;
}

function contentTypeFor(filePath: string) {
  if (filePath.endsWith(".svg")) return "image/svg+xml; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}
