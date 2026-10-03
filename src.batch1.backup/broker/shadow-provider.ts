import type {
  BrokerOrderIntent,
  BrokerOrderResult,
  BrokerPosition,
  BrokerPreflightResult,
  BrokerProvider,
  BrokerReconciliationResult,
  BrokerStatus,
} from "@/broker/types";

export class ShadowBrokerProvider implements BrokerProvider {
  readonly id = "shadow";

  async status(): Promise<BrokerStatus> {
    return {
      providerId: this.id,
      connected: true,
      tradeAllowed: false,
      expertTradingAllowed: null,
      terminalTradingAllowed: null,
      accountCurrency: null,
      balance: null,
      equity: null,
      message:
        "Synthetic shadow broker is active; no external order can be transmitted.",
    };
  }

  async preflight(
    intent: BrokerOrderIntent
  ): Promise<BrokerPreflightResult> {
    const valid =
      intent.volume > 0 &&
      intent.expectedEntry > 0 &&
      intent.stopLoss > 0 &&
      ((intent.side === "BUY" &&
        intent.stopLoss < intent.expectedEntry) ||
        (intent.side === "SELL" &&
          intent.stopLoss > intent.expectedEntry));

    return {
      ok: valid,
      code: valid ? "SHADOW_OK" : "SHADOW_INVALID",
      message: valid
        ? "Shadow preflight accepted; no broker side effect."
        : "Shadow preflight rejected invalid order geometry.",
      bid: null,
      ask: null,
      normalizedVolume: valid ? intent.volume : null,
    };
  }

  async placeOrder(
    intent: BrokerOrderIntent
  ): Promise<BrokerOrderResult> {
    const preflight = await this.preflight(intent);
    return {
      accepted: preflight.ok,
      outcome: preflight.ok ? "PLACED" : "REJECTED",
      code: preflight.code,
      message: preflight.ok
        ? "Shadow order recorded only; no broker order was sent."
        : preflight.message,
      clientTag: intent.clientTag,
      orderId: null,
      dealId: null,
      positionId: null,
      filledPrice: null,
    };
  }

  async listOpenPositions(): Promise<BrokerPosition[]> {
    return [];
  }

  async reconcile(
    clientTag: string
  ): Promise<BrokerReconciliationResult> {
    return {
      found: false,
      state: "NOT_FOUND",
      clientTag,
      orderId: null,
      dealId: null,
      positionId: null,
      message:
        "Synthetic shadow provider has no external broker state.",
    };
  }
}
