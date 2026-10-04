import { DEFAULT_SYMBOL_UNIVERSE, SYMBOL_METADATA } from "@/config/scanner";
import { resolveRuntimeSymbols } from "@/providers/market-data/runtime-provider";
import {
  addScannerSymbol,
  readScannerUniverse,
  removeScannerSymbol,
} from "@/server/scanner-universe-access";
import { readPaperDashboard } from "@/server/paper-trading-access";
import { resolveRuntimeRelease } from "@/server/release-runtime-access";
import {
  errorResponse,
  okResponse,
  requireBrokerSecret,
  requireJsonBody,
} from "@/server/api-guard";

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

/**
 * M8A-G2-3: symbol must be a 6-letter code that exists in SYMBOL_METADATA.
 * Without this an attacker could inject a 1 MB string or a name outside the
 * supported universe. The same normalization the scanner uses is applied.
 */
function normalizeSymbolInput(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{6}$/.test(normalized)) return null;
  return normalized in SYMBOL_METADATA ? normalized : null;
}

export async function GET() {
  try {
    return okResponse(await readScannerUniverse(await fallbackSymbols()));
  } catch (error) {
    return errorResponse(error, "Scanner universe unavailable.");
  }
}

export async function POST(request: Request) {
  try {
    // H8A-G2-2: mutating the scanner universe without authentication lets an
    // attacker disable the trading engine by removing every symbol, or fill
    // the dashboard with garbage. Auth is mandatory.
    requireBrokerSecret(request);
    requireJsonBody(request);

    const body = (await request.json()) as {
      action?: unknown;
      symbol?: unknown;
    };
    const action = body.action;
    const symbol =
      typeof body.symbol === "string"
        ? normalizeSymbolInput(body.symbol)
        : null;
    const fallback = await fallbackSymbols();

    if (symbol === null) {
      return errorResponse(
        new Error("symbol must be a supported 6-letter pair."),
        "Invalid symbol.",
        { expose: true, statusOverride: 400 }
      );
    }

    if (action === "add") {
      return okResponse(await addScannerSymbol(symbol, fallback));
    }

    if (action === "remove") {
      const paper = await readPaperDashboard();
      if (paper.openPositions.some((position) => position.symbol === symbol)) {
        return errorResponse(
          new Error("Close the open paper position before removing this pair."),
          "Open paper position blocks removal.",
          { expose: true, statusOverride: 409 }
        );
      }
      return okResponse(await removeScannerSymbol(symbol, fallback));
    }

    return errorResponse(
      new Error("Unsupported scanner universe action."),
      "Unsupported scanner universe action.",
      { expose: true, statusOverride: 400 }
    );
  } catch (error) {
    return errorResponse(error, "Scanner universe update failed.");
  }
}