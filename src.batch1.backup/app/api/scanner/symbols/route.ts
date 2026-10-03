import { NextResponse } from "next/server";
import { DEFAULT_SYMBOL_UNIVERSE } from "@/config/scanner";
import { resolveRuntimeSymbols } from "@/providers/market-data/runtime-provider";
import {
  addScannerSymbol,
  readScannerUniverse,
  removeScannerSymbol,
} from "@/server/scanner-universe-access";
import { readPaperDashboard } from "@/server/paper-trading-access";
import { resolveRuntimeRelease } from "@/server/release-runtime-access";

export const dynamic = "force-dynamic";

async function fallbackSymbols(): Promise<string[]> {
  const release = await resolveRuntimeRelease();
  const releaseSymbols = Array.isArray(release.scannerOverrides?.symbols)
    ? release.scannerOverrides.symbols.filter(
        (symbol): symbol is string => typeof symbol === "string"
      )
    : null;
  return releaseSymbols?.length
    ? releaseSymbols
    : resolveRuntimeSymbols() ?? DEFAULT_SYMBOL_UNIVERSE;
}

export async function GET() {
  return NextResponse.json(
    await readScannerUniverse(await fallbackSymbols())
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: unknown;
      symbol?: unknown;
    };
    const action = body.action;
    const symbol = typeof body.symbol === "string" ? body.symbol : "";
    const fallback = await fallbackSymbols();

    if (action === "add") {
      return NextResponse.json(await addScannerSymbol(symbol, fallback));
    }

    if (action === "remove") {
      const paper = await readPaperDashboard();
      if (paper.openPositions.some((position) => position.symbol === symbol.toUpperCase())) {
        return NextResponse.json(
          { error: "Close the open paper position before removing this pair." },
          { status: 409 }
        );
      }
      return NextResponse.json(await removeScannerSymbol(symbol, fallback));
    }

    return NextResponse.json(
      { error: "Unsupported scanner universe action." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
