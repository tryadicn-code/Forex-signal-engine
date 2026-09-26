/**
 * Tiny class-name joiner.
 *
 * Deliberately dependency-free (no clsx/tailwind-merge yet) so Phase 1 stays
 * install-light. Upgrade only when conditional styling genuinely needs it.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
