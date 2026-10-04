import type {
  BrokerOrderIntent,
  BrokerOrderResult,
  BrokerPosition,
  BrokerPreflightResult,
  BrokerProvider,
  BrokerReconciliationResult,
  BrokerStatus,
} from "@/broker/types";

interface Mt5BrokerProviderOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
}

export class Mt5BrokerProvider implements BrokerProvider {
  readonly id = "mt5";
  private readonly baseUrl: string;

  constructor(private readonly options: Mt5BrokerProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  status(): Promise<BrokerStatus> {
    return this.request<BrokerStatus>("/trade/status", {
      method: "GET",
    });
  }

  preflight(
    intent: BrokerOrderIntent
  ): Promise<BrokerPreflightResult> {
    return this.request<BrokerPreflightResult>("/trade/check", {
      method: "POST",
      body: JSON.stringify(toBridgeOrder(intent)),
    });
  }

  placeOrder(
    intent: BrokerOrderIntent
  ): Promise<BrokerOrderResult> {
    return this.request<BrokerOrderResult>("/trade/order", {
      method: "POST",
      body: JSON.stringify({
        ...toBridgeOrder(intent),
        liveConfirmation: "FSE-LIVE",
      }),
    });
  }

  async listOpenPositions(): Promise<BrokerPosition[]> {
    const response = await this.request<{ positions?: unknown }>(
      "/trade/positions",
      { method: "GET" }
    );
    // H5-B4: reject non-array payloads instead of letting undefined flow
    // into intentLiveBlockers and fail with a confusing TypeError.
    if (!Array.isArray(response.positions)) {
      throw new Error(
        "MT5 broker bridge returned a non-array positions payload at /trade/positions."
      );
    }
    return response.positions as BrokerPosition[];
  }

  reconcile(
    clientTag: string
  ): Promise<BrokerReconciliationResult> {
    return this.request<BrokerReconciliationResult>(
      "/trade/reconcile?tag=" +
        encodeURIComponent(clientTag),
      { method: "GET" }
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs
    );

    try {
      const response = await fetch(this.baseUrl + path, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + this.options.token,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(
          "MT5 broker bridge HTTP " +
            response.status +
            " at " +
            path +
            (text ? ": " + text.slice(0, 500) : "")
        );
      }
      try {
        return JSON.parse(text) as T;
      } catch (error) {
        // H5-3: a non-JSON 200 response from a local AV or proxy used to
        // surface as a bare SyntaxError. Surface the path, status, and a
        // truncated body so the operator can see what actually happened.
        const snippet = text.length > 200 ? text.slice(0, 200) + "..." : text;
        throw new Error(
          "MT5 broker bridge returned non-JSON at " + path +
            " (HTTP " + response.status + "): " +
            (error instanceof Error ? error.message : String(error)) +
            ". Body: " + snippet
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function toBridgeOrder(intent: BrokerOrderIntent) {
  return {
    idempotencyKey: intent.idempotencyKey,
    clientTag: intent.clientTag,
    symbol: intent.symbol,
    side: intent.side,
    volume: intent.volume,
    expectedEntry: intent.expectedEntry,
    stopLoss: intent.stopLoss,
    takeProfit: intent.takeProfit,
    maxDeviationPoints: intent.maxDeviationPoints,
  };
}
