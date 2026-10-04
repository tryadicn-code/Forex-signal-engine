/**
 * Shared fetch client for the workstation UI.
 *
 * Batch 8D introduced mandatory approval-secret auth on every mutating
 * endpoint. Rather than each component assembling the header and handling
 * 401 individually, they call apiFetch() which:
 *   - injects x-fse-approval-secret when a secret is available
 *   - classifies HTTP failures into typed ApiError codes
 *   - emits a global fse:request-approval-secret event on 401 so a dialog
 *     can prompt the operator without every caller having to render one
 *
 * The secret is stored in sessionStorage: it lives only for the current
 * browser tab session and disappears when the tab is closed.
 */

const SECRET_KEY = "fse:approval-secret";
const SECRET_EVENT = "fse:request-approval-secret";

export function getApprovalSecret(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SECRET_KEY);
  } catch {
    return null;
  }
}

export function setApprovalSecret(secret: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SECRET_KEY, secret);
}

export function clearApprovalSecret(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(SECRET_KEY);
}

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "SERVER"
  | "NETWORK"
  | "TIMEOUT";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ApiErrorCode,
    public readonly body: unknown = null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
  /**
   * When false, do not attach the approval secret. Use for public GET
   * endpoints (scanner reads, market data, health).
   */
  requireSecret?: boolean;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { timeoutMs, requireSecret = true, headers: initHeaders, ...rest } = options;

  const controller = new AbortController();
  const timer = timeoutMs
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const headers = new Headers(initHeaders ?? {});
  if (requireSecret) {
    const secret = getApprovalSecret();
    if (secret) headers.set("x-fse-approval-secret", secret);
  }

  try {
    const response = await fetch(url, { ...rest, headers, signal: controller.signal });
    // Prefer text() for real fetch responses; fall back to json() for mock
    // implementations that only provide json(). This keeps the client usable
    // in unit tests that build a minimal Response-shaped object.
    const body: unknown = await readBody(response);

    if (!response.ok) {
      if (response.status === 401) {
        // Surface a global event so the dialog can open. Caller still gets
        // the thrown ApiError so its loading spinner terminates cleanly.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SECRET_EVENT));
        }
        throw new ApiError(
          "Approval secret is required or invalid.",
          401,
          "UNAUTHORIZED",
          body
        );
      }
      if (response.status === 404) {
        throw new ApiError("Resource not found.", 404, "NOT_FOUND", body);
      }
      const message =
        body && typeof body === "object" && "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `Request failed with HTTP ${response.status}.`;
      throw new ApiError(message, response.status, "SERVER", body);
    }

    return body as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timed out.", 0, "TIMEOUT");
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : String(error),
      0,
      "NETWORK"
    );
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
}

/** Listen for global approval-secret prompts. Returns an unsubscribe fn. */
export function onApprovalSecretRequest(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = () => handler();
  window.addEventListener(SECRET_EVENT, listener);
  return () => window.removeEventListener(SECRET_EVENT, listener);
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readBody(response: Response): Promise<unknown> {
  if (typeof response.text === "function") {
    const text = await response.text();
    return text ? safeParse(text) : null;
  }
  if (typeof response.json === "function") {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  return null;
}