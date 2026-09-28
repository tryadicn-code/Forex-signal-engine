"use client";

import { useEffect, useState } from "react";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import type { DashboardData } from "@/types/dashboard";

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/scanner", {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Dashboard load failed with HTTP " + response.status + ".");
        }
        return (await response.json()) as DashboardData;
      })
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [retryNonce]);

  if (data) {
    return <DashboardWorkspace initialData={data} />;
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1900px] p-3 sm:p-4">
        <section
          role="alert"
          className="rounded-md border border-orange-700/50 bg-orange-950/20 p-4"
        >
          <div className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-300">
            Dashboard data unavailable
          </div>
          <p className="mt-2 text-xs leading-relaxed text-orange-200/70">{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setData(null);
              setRetryNonce((value) => value + 1);
            }}
            className="mt-3 rounded-md border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Retry
          </button>
        </section>
      </div>
    );
  }

  return <DashboardClientSkeleton />;
}

function DashboardClientSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading interactive signal dashboard"
      className="mx-auto w-full max-w-[1900px] space-y-4 p-3 sm:p-4"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-40 animate-pulse rounded bg-zinc-800" />
          <div className="h-6 w-44 animate-pulse rounded bg-zinc-800" />
          <p className="text-[11px] text-zinc-600">
            Starting interactive dashboard…
          </p>
        </div>
        <div className="h-9 w-20 animate-pulse rounded-md bg-zinc-800" />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-20 animate-pulse rounded-md border border-zinc-800 bg-zinc-900/35"
          />
        ))}
      </div>

      <div className="h-80 animate-pulse rounded-md border border-zinc-800 bg-zinc-900/30" />
    </div>
  );
}
