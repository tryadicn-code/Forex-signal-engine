"use client";

import { ApprovalSecretDialog } from "@/components/system/approval-secret-dialog";

/**
 * Client-side overlays mounted once in the root layout. Currently only the
 * approval-secret dialog, but future global modals belong here too.
 */
export function GlobalOverlays() {
  return <ApprovalSecretDialog />;
}