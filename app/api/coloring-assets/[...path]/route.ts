import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getColoringAssetContentType, normalizeAssetSubpath } from "@/lib/coloring/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENABLED = process.env.COLORING_ENABLE_LOCAL_ASSET_PROXY === "1";
const ASSET_ROOT_PARTS = ["pipeline", "production", "full", "assets"];

type AssetRouteContext = {
  params: Promise<{ path?: string[] }>;
};

export async function GET(_request: NextRequest, context: AssetRouteContext) {
  if (!ENABLED) {
    return NextResponse.json({ error: "Local coloring asset proxy is disabled" }, { status: 404 });
  }

  const { path: requestedPath = [] } = await context.params;
  const safeSubpath = normalizeAssetSubpath(requestedPath.join("/"));
  if (!safeSubpath) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  const assetRoot = getAssetRoot();
  const target = path.resolve(assetRoot, ...safeSubpath.split("/"));
  const relativeTarget = path.relative(assetRoot, target);
  if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  try {
    const bytes = await readFile(target);
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": getColoringAssetContentType(safeSubpath) || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
}

function getAssetRoot() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), ...ASSET_ROOT_PARTS);
}
