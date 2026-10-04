import { NextResponse } from "next/server";
import {
  BacktestValidationError,
  type BacktestRunConfig,
} from "@/replay/backtest-run-types";
import type {
  HistoricalIntrabarConflictPolicy,
} from "@/replay/execution-types";
import type { HistoricalTextFile } from "@/replay/import-types";
import { executeAndPersistBacktest } from "@/server/backtest-access";
import { requireBrokerSecret } from "@/server/api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILES = 64;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    // H8A-G2-3: backtest runs are CPU-heavy, buffer up to 128 MB in memory,
    // and write a report to disk. Authentication is mandatory so this cannot
    // be used to exhaust server resources.
    requireBrokerSecret(request);

    const form = await request.formData();
    const uploads = form.getAll("files").filter(
      (value): value is File => value instanceof File
    );

    if (uploads.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Select at least one CSV/TXT historical file." },
        { status: 400 }
      );
    }
    if (uploads.length > MAX_FILES) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Too many files. Maximum supported in one synchronous run is " +
            MAX_FILES +
            ".",
        },
        { status: 413 }
      );
    }

    let totalBytes = 0;
    for (const file of uploads) {
      if (!/\.(csv|txt)$/i.test(file.name)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Unsupported file '" +
              file.name +
              "'. Only .csv and .txt are accepted.",
          },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "File '" +
              file.name +
              "' exceeds the 20 MB per-file safety limit.",
          },
          { status: 413 }
        );
      }
      totalBytes += file.size;
    }

    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "Combined upload exceeds the 128 MB safety limit.",
        },
        { status: 413 }
      );
    }

    const files: HistoricalTextFile[] = await Promise.all(
      uploads.map(async (file) => ({
        name: file.name,
        text: await file.text(),
      }))
    );

    const config = parseConfig(form);
    const artifact = await executeAndPersistBacktest(files, config);

    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    if (error instanceof BacktestValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          validation: error.validation,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected backtest run failure.",
      },
      { status: 500 }
    );
  }
}

function parseConfig(form: FormData): BacktestRunConfig {
  const datasetId = stringField(form, "datasetId");
  const source =
    optionalStringField(form, "source") || "MT5 / CSV historical upload";
  const sourceUtcOffsetMinutes = numberField(
    form,
    "sourceUtcOffsetMinutes",
    0
  );
  const assumedSpreadPips = numberField(form, "assumedSpreadPips", 1);
  const initialBalance = numberField(form, "initialBalance", 10_000);
  const riskPercent = numberField(form, "riskPercent", 0.5);
  const maxOpenPositions = numberField(form, "maxOpenPositions", 10);
  const maxTotalOpenRiskPercent = numberField(
    form,
    "maxTotalOpenRiskPercent",
    5
  );
  const maxReplaySteps = numberField(form, "maxReplaySteps", 50_000);

  const rawPolicy =
    optionalStringField(form, "intrabarConflictPolicy") || "STOP_FIRST";
  const policies: HistoricalIntrabarConflictPolicy[] = [
    "STOP_FIRST",
    "TARGET_FIRST",
    "REJECT_AMBIGUOUS",
  ];
  if (!policies.includes(rawPolicy as HistoricalIntrabarConflictPolicy)) {
    throw new Error("Invalid intrabar conflict policy.");
  }

  return {
    datasetId,
    source,
    sourceUtcOffsetMinutes,
    assumedSpreadPips,
    startAt: optionalDateField(form, "startAt", "start"),
    endAt: optionalDateField(form, "endAt", "end"),
    initialBalance,
    riskPercent,
    intrabarConflictPolicy: rawPolicy as HistoricalIntrabarConflictPolicy,
    maxOpenPositions,
    maxTotalOpenRiskPercent,
    maxReplaySteps,
  };
}

function stringField(form: FormData, key: string): string {
  const value = optionalStringField(form, key);
  if (!value) throw new Error(key + " is required.");
  return value;
}

function optionalStringField(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function numberField(
  form: FormData,
  key: string,
  fallback: number
): number {
  const raw = optionalStringField(form, key);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(key + " must be a finite number.");
  }
  return value;
}

function optionalDateField(
  form: FormData,
  key: string,
  edge: "start" | "end"
): number | null {
  const raw = optionalStringField(form, key);
  if (!raw) return null;

  const iso =
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? raw + (edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z")
      : raw;
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) {
    throw new Error(key + " must be a valid ISO date.");
  }
  return value;
}
