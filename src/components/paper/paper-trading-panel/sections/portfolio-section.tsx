import { useState } from "react";
import type { PaperDashboardData } from "@/paper/types";
import { formatPrice, formatTimeShort } from "@/lib/format";
import {
  ORDERS_PREVIEW_COUNT,
  type OrdersView,
} from "../lib/types";
import {
  ordersTotalPages,
  sortOrdersByRequestedAt,
  visibleOrders,
} from "../lib/filters";
import { money, pct, riskReward } from "../lib/formatters";
import { InitialBalanceControl } from "../components/initial-balance-control";
import { InlineDatum } from "../components/inline-datum";
import { metricInline } from "../components/metric";

export function PortfolioSection({
  paper,
  onSetInitialBalance,
  settingInitialBalance,
  onReset,
  resetting,
  onClosePosition,
  closingPositionId,
  onUpdatePositionRR,
  updatingRRId = null,
  onOpenAnalysis,
}: {
  paper: PaperDashboardData;
  onSetInitialBalance?: (initialBalance: number) => Promise<void>;
  settingInitialBalance: boolean;
  onReset: () => Promise<void>;
  resetting: boolean;
  onClosePosition?: (positionId: string) => Promise<void>;
  closingPositionId: string | null;
  onUpdatePositionRR?: (positionId: string, newRR: number) => Promise<void>;
  updatingRRId?: string | null;
  onOpenAnalysis?: (symbol: string) => void;
}) {
  const [ordersView, setOrdersView] = useState<OrdersView>({ mode: "collapsed" });
  const [editingRRPositionId, setEditingRRPositionId] = useState<string | null>(null);
  const [rrDraft, setRRDraft] = useState("");
  const [rrError, setRRError] = useState<string | null>(null);
  const { account } = paper;
  const sortedOrders = sortOrdersByRequestedAt(paper.recentOrders);
  const shownOrders = visibleOrders(sortedOrders, ordersView);
  const totalOrderPages = ordersTotalPages(sortedOrders.length);

  return (
    <section
      id="portfolio"
      aria-label="Paper portfolio"
      className="scroll-mt-16 rounded-lg border border-zinc-800 bg-zinc-900/30"
    >
      {onSetInitialBalance && (
        <InitialBalanceControl
          key={account.initialBalance}
          initialBalance={account.initialBalance}
          currency={account.currency}
          onApply={onSetInitialBalance}
          applying={settingInitialBalance}
          onReset={onReset}
          resetting={resetting}
        />
      )}

      {paper.persistenceError && (
        <div className="m-3 rounded-md border border-orange-800/50 bg-orange-950/20 px-3 py-2 text-xs text-orange-200">
          <span className="font-mono font-semibold">PAPER STORAGE</span>
          <span className="ml-2 text-orange-200/70">{paper.persistenceError}</span>
        </div>
      )}

      <div className="grid grid-cols-3 [&>*]:border-r [&>*]:border-b [&>*]:border-zinc-800/50 [&>*:nth-child(3n)]:border-r-0 [&>*:nth-last-child(-n+3)]:border-b-0">
        {metricInline("Balance", money(account.balance, account.currency))}
        {metricInline("Equity", money(account.equity, account.currency))}
        {metricInline(
          "Realized",
          money(account.realizedPnL, account.currency),
          undefined,
          account.realizedPnL > 0 ? "positive" : account.realizedPnL < 0 ? "negative" : "neutral"
        )}
        {metricInline(
          "Floating",
          money(account.unrealizedPnL, account.currency),
          undefined,
          account.unrealizedPnL > 0 ? "positive" : account.unrealizedPnL < 0 ? "negative" : "neutral"
        )}
        {metricInline(
          "Open risk",
          pct(account.openRiskPercent),
          undefined,
          "neutral",
          "($" + account.openRiskAmount.toFixed(2) + ")"
        )}
        {metricInline("Positions", String(account.openPositionCount))}
      </div>

      <div className="border-t border-zinc-800">
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Open positions
          </h3>
          <span className="font-mono text-[11px] text-zinc-600">
            max {paper.config.maxOpenPositions} · {paper.config.maxOpenPositionsPerSymbol}/symbol · currency cap {paper.config.maxDirectionalCurrencyExposure}
          </span>
        </div>

        {paper.openPositions.length === 0 ? (
          <p className="border-t border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
            No paper positions are open. Only genuine EXECUTE signals can create one.
          </p>
        ) : (
          <div className="divide-y divide-zinc-800 border-t border-zinc-800">
            {paper.openPositions.map((position) => (
              <article
                key={position.id}
                role={onOpenAnalysis ? "button" : undefined}
                tabIndex={onOpenAnalysis ? 0 : undefined}
                aria-label={
                  onOpenAnalysis
                    ? `Open analysis for ${position.symbol}`
                    : undefined
                }
                onClick={() => onOpenAnalysis?.(position.symbol)}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onOpenAnalysis?.(position.symbol);
                  }
                }}
                className={
                  "border-b border-zinc-800/70 px-3 py-2.5 last:border-b-0 " +
                  (onOpenAnalysis
                    ? "cursor-pointer transition-colors hover:bg-zinc-800/35 focus-visible:bg-zinc-800/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700/70"
                    : "")
                }
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-zinc-100">
                    {position.symbol}
                  </span>
                  {onOpenAnalysis && (
                    <span className="text-[11px] font-medium text-zinc-600">
                      Analysis ›
                    </span>
                  )}

                  <span
                    className={
                      "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold " +
                      (position.side === "LONG"
                        ? "border-emerald-800/70 bg-emerald-950/20 text-emerald-300"
                        : "border-rose-800/70 bg-rose-950/20 text-rose-300")
                    }
                  >
                    {position.side}
                  </span>

                  <span className="whitespace-nowrap rounded border border-sky-700/60 bg-sky-950/25 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                    {position.positionSize.toFixed(2)} lot
                  </span>

                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <span
                      className={
                        "whitespace-nowrap font-mono text-xs font-semibold " +
                        (position.unrealizedPnL > 0
                          ? "text-emerald-300"
                          : position.unrealizedPnL < 0
                            ? "text-red-300"
                            : "text-zinc-200")
                      }
                    >
                      {money(position.unrealizedPnL, account.currency)}
                    </span>
                    {onClosePosition && (
                      <button
                        type="button"
                        disabled={closingPositionId !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onClosePosition(position.id);
                        }}
                        className="shrink-0 whitespace-nowrap rounded border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-red-800/70 hover:bg-red-950/20 hover:text-red-300 disabled:opacity-40"
                      >
                        {closingPositionId === position.id ? "Closing…" : "Close"}
                      </button>
                    )}
                    {onUpdatePositionRR && position.tp1 == null && (
                      <button
                        type="button"
                        disabled={updatingRRId !== null}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingRRPositionId(position.id);
                          setRRDraft(
                            Number(
                              position.plannedRR ??
                                riskReward(position.entryPrice, position.takeProfit, position.stopLoss)
                            ).toFixed(2)
                          );
                          setRRError(null);
                        }}
                        className="shrink-0 whitespace-nowrap rounded border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:border-emerald-800/70 hover:bg-emerald-950/20 hover:text-emerald-300 disabled:opacity-40"
                      >
                        {updatingRRId === position.id ? "Saving..." : "Edit RR"}
                      </button>
                    )}
                  </div>
                </div>

                {position.tp1 != null ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-5">
                    <InlineDatum
                      label="Entry"
                      value={formatPrice(position.symbol, position.entryPrice)}
                    />
                    <InlineDatum
                      label="Current"
                      value={formatPrice(position.symbol, position.currentPrice)}
                    />
                    <InlineDatum
                      label={position.tp1HitAt != null ? "TP1 (hit)" : "TP1"}
                      value={formatPrice(position.symbol, position.tp1)}
                      tone="positive"
                    />
                    <InlineDatum
                      label="TP2"
                      value={formatPrice(position.symbol, position.tp2 ?? null)}
                      tone="positive"
                    />
                    <InlineDatum
                      label="SL"
                      value={formatPrice(position.symbol, position.stopLoss)}
                      tone="negative"
                    />
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] sm:text-[11px]">
                    <InlineDatum
                      label="Entry"
                      value={formatPrice(position.symbol, position.entryPrice)}
                    />
                    <InlineDatum
                      label="Current"
                      value={formatPrice(position.symbol, position.currentPrice)}
                    />
                    <InlineDatum
                      label="TP"
                      value={formatPrice(position.symbol, position.takeProfit)}
                      tone="positive"
                    />
                    <InlineDatum
                      label="SL"
                      value={formatPrice(position.symbol, position.stopLoss)}
                      tone="negative"
                    />
                  </div>
                )}

                <div className="mt-1.5 whitespace-nowrap font-mono text-[11px] text-zinc-600">
                  MFE {(position.maxFavorableR ?? 0) >= 0 ? "+" : ""}
                  {(position.maxFavorableR ?? 0).toFixed(2)}R · MAE{" "}
                  {(position.maxAdverseR ?? 0).toFixed(2)}R · RR{" "}
                  {riskReward(
                    position.entryPrice,
                    position.takeProfit,
                    position.stopLoss
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800">
        <div className="flex items-center justify-between px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Recent orders
          </h3>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-zinc-600">
              {sortedOrders.length} total
            </span>
            {sortedOrders.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setOrdersView((prev) =>
                    prev.mode === "collapsed"
                      ? { mode: "preview" }
                      : { mode: "collapsed" }
                  )
                }
                className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              >
                {ordersView.mode === "collapsed" ? "▸ Show" : "▾ Hide"}
              </button>
            )}
          </div>
        </div>

        {sortedOrders.length === 0 ? (
          <p className="border-t border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
            No paper orders recorded yet.
          </p>
        ) : ordersView.mode === "collapsed" ? null : (
          <>
            <div className="divide-y divide-zinc-800 border-t border-zinc-800">
              {shownOrders.map((order) => (
                <article key={order.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-100">
                      {order.symbol}
                    </span>
                    <span
                      className={
                        "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold " +
                        (order.side === "LONG"
                          ? "border-emerald-800/70 bg-emerald-950/20 text-emerald-300"
                          : "border-rose-800/70 bg-rose-950/20 text-rose-300")
                      }
                    >
                      {order.side}
                    </span>
                    <span
                      className={
                        "rounded border px-1.5 py-0.5 font-mono text-[11px] font-semibold " +
                        (order.status === "FILLED"
                          ? "border-emerald-800/70 bg-emerald-950/20 text-emerald-300"
                          : "border-red-800/70 bg-red-950/20 text-red-300")
                      }
                    >
                      {order.status}
                    </span>
                    <span className="ml-auto font-mono text-[11px] tabular-nums text-zinc-600">
                      {formatTimeShort(order.requestedAt)}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                    <InlineDatum
                      label="Entry"
                      value={formatPrice(
                        order.symbol,
                        order.fillPrice ?? order.requestedEntry
                      )}
                    />
                    <InlineDatum
                      label="SL"
                      value={formatPrice(order.symbol, order.stopLoss)}
                      tone="negative"
                    />
                    <InlineDatum
                      label="TP"
                      value={formatPrice(order.symbol, order.takeProfit)}
                      tone="positive"
                    />
                    <InlineDatum
                      label="Size"
                      value={order.positionSize.toFixed(2)}
                    />
                  </div>

                  {order.status === "REJECTED" && order.rejectionReason && (
                    <div className="mt-1.5 font-mono text-[11px] text-red-300/80">
                      Rejected: {order.rejectionReason}
                    </div>
                  )}
                </article>
              ))}
            </div>

            {ordersView.mode === "preview" && sortedOrders.length > ORDERS_PREVIEW_COUNT && (
              <div className="border-t border-zinc-800 px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => setOrdersView({ mode: "paged", page: 1 })}
                  className="font-mono text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  Show all ({sortedOrders.length}) →
                </button>
              </div>
            )}

            {ordersView.mode === "paged" && (
              <div className="border-t border-zinc-800 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={ordersView.page <= 1}
                    onClick={() =>
                      setOrdersView({ mode: "paged", page: ordersView.page - 1 })
                    }
                    className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                  >
                    ◀ Prev
                  </button>
                  <span className="font-mono text-[11px] text-zinc-500">
                    Page {ordersView.page} / {totalOrderPages}
                  </span>
                  <button
                    type="button"
                    disabled={ordersView.page >= totalOrderPages}
                    onClick={() =>
                      setOrdersView({ mode: "paged", page: ordersView.page + 1 })
                    }
                    className="rounded border border-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                  >
                    Next ▸
                  </button>
                </div>
                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => setOrdersView({ mode: "preview" })}
                    className="font-mono text-[11px] text-zinc-500 hover:text-zinc-300"
                  >
                    ← Show less
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {editingRRPositionId !== null && (() => {
        const pos = paper.openPositions.find((p) => p.id === editingRRPositionId);
        if (!pos) return null;
        const newRR = Number(rrDraft);
        const validRR = Number.isFinite(newRR) && newRR >= 0.5 && newRR <= 10;
        const stopDistance = Math.abs(pos.entryPrice - pos.stopLoss);
        const long = pos.side === "LONG";
        const newTP = validRR
          ? long
            ? pos.entryPrice + stopDistance * newRR
            : pos.entryPrice - stopDistance * newRR
          : null;
        const tpHidden =
          validRR &&
          newTP !== null &&
          ((long && newTP <= pos.currentPrice) ||
            (!long && newTP >= pos.currentPrice));

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit position RR"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => {
              if (updatingRRId) return;
              setEditingRRPositionId(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold text-zinc-100">
                Edit RR - {pos.symbol} {pos.side}
              </h3>
              <p className="mt-1 text-[11px] text-zinc-500">
                SL tetap. TP dihitung ulang dari RR baru. Hanya legacy single-TP.
              </p>

              <div className="mt-3 space-y-2 text-[11px]">
                <div className="flex justify-between font-mono text-zinc-400">
                  <span>Entry</span>
                  <span className="text-zinc-200">{formatPrice(pos.symbol, pos.entryPrice)}</span>
                </div>
                <div className="flex justify-between font-mono text-zinc-400">
                  <span>SL</span>
                  <span className="text-rose-300">{formatPrice(pos.symbol, pos.stopLoss)}</span>
                </div>
                <div className="flex justify-between font-mono text-zinc-400">
                  <span>RR sekarang</span>
                  <span className="text-zinc-200">
                    {riskReward(pos.entryPrice, pos.takeProfit, pos.stopLoss)}
                  </span>
                </div>
                {newTP !== null && !tpHidden && (
                  <div className="flex justify-between font-mono text-zinc-400">
                    <span>TP baru (RR {newRR.toFixed(2)})</span>
                    <span className="text-emerald-300">{formatPrice(pos.symbol, newTP)}</span>
                  </div>
                )}
              </div>

              <label className="mt-3 block text-[11px] text-zinc-400">
                <span>RR baru (0.5 - 10)</span>
                <input
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.1}
                  value={rrDraft}
                  onChange={(e) => setRRDraft(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                  autoFocus
                />
              </label>

              {(rrError || (!validRR && rrDraft.length > 0) || tpHidden) && (
                <div className="mt-2 rounded border border-red-900/60 bg-red-950/20 px-2 py-1.5 text-[11px] text-red-200">
                  {rrError ??
                    (!validRR
                      ? "RR harus di antara 0.5 dan 10."
                      : "TP baru berada di belakang harga saat ini.")}
                </div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={updatingRRId !== null}
                  onClick={() => setEditingRRPositionId(null)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-300 disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!validRR || tpHidden || updatingRRId !== null}
                  onClick={async () => {
                    try {
                      setRRError(null);
                      await onUpdatePositionRR!(pos.id, newRR);
                      setEditingRRPositionId(null);
                    } catch (err) {
                      setRRError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                  className="rounded border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-[11px] font-medium text-emerald-200 disabled:opacity-40"
                >
                  {updatingRRId === pos.id ? "Menyimpan..." : "Apply"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
