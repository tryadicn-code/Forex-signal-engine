"use client";

import { useEffect, useState } from "react";
import {
  clearApprovalSecret,
  getApprovalSecret,
  onApprovalSecretRequest,
  setApprovalSecret,
} from "@/lib/api-client";
import { ModalCloseButton } from "@/components/common/modal-close-button";
import { useFocusTrap } from "@/components/common/use-focus-trap";

/**
 * Global approval-secret dialog.
 *
 * Triggered automatically by apiFetch() when a mutating request gets a 401,
 * or opened manually by the operator from the system page. The secret is
 * persisted in sessionStorage only, so it dies with the tab.
 */
export function ApprovalSecretDialog() {
  const [open, setOpen] = useState(false);
  // Lazy initializer runs once on the first client render, avoiding a
  // setState-in-effect lint violation. getApprovalSecret() is SSR-safe
  // (returns null when window is undefined).
  const [hasSecret, setHasSecret] = useState<boolean>(() =>
    Boolean(getApprovalSecret())
  );
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onApprovalSecretRequest(() => setOpen(true));
  }, []);

  const close = () => {
    setOpen(false);
    setError(null);
    setValue("");
  };

  const save = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError("Secret must not be empty.");
      return;
    }
    setApprovalSecret(trimmed);
    setHasSecret(true);
    close();
  };

  const clear = () => {
    clearApprovalSecret();
    setHasSecret(false);
    close();
  };

  // A global button to open the dialog is exposed via window so any page can
  // trigger it without lifting the dialog to every route.
  useEffect(() => {
    const openManually = () => setOpen(true);
    window.addEventListener("fse:open-approval-secret-dialog", openManually);
    return () => {
      window.removeEventListener(
        "fse:open-approval-secret-dialog",
        openManually
      );
    };
  }, []);

  const trapRef = useFocusTrap<HTMLDivElement>(open);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Approval secret"
      className="fixed inset-0 z-[100] flex items-end bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
    >
      <div
        ref={trapRef}
        className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-[#0b0e14] p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Approval secret
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Required for scanner refresh, pair changes, paper controls, and
              other mutating actions. Matches{" "}
              <span className="font-mono text-zinc-400">
                FSE_LIVE_APPROVAL_SECRET
              </span>{" "}
              on the server.
            </p>
          </div>
          <ModalCloseButton onClick={close} />
        </div>

        {hasSecret && (
          <p className="mt-3 rounded-md border border-emerald-900/50 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-300">
            A secret is currently set for this browser tab.
          </p>
        )}

        <div className="mt-4 space-y-2">
          <label
            htmlFor="approval-secret-input"
            className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500"
          >
            Secret
          </label>
          <input
            id="approval-secret-input"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
            }}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-emerald-700"
          />
          {error && (
            <p role="alert" className="text-[11px] text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {hasSecret && (
            <button
              type="button"
              onClick={clear}
              className="rounded-md border border-zinc-700 bg-zinc-900/45 px-3 py-1.5 text-[11px] text-zinc-400 hover:border-red-900/60 hover:text-red-300"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={save}
            className="rounded-md border border-emerald-800/70 bg-emerald-950/25 px-3 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-950/45"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper any component can call to open the dialog programmatically. Typed
 * as a window CustomEvent so it does not require React context.
 */
export function requestApprovalSecretDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("fse:open-approval-secret-dialog"));
}