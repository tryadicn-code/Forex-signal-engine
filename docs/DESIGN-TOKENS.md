# Design Tokens

This document is the contract between the design decisions made in the
mobile UI/UX audit (Phase Aâ€“D) and the code that consumes them.

All tokens live in `src/app/globals.css` under the `@theme` block marked
`Design tokens (Phase D3)`. They are **additive**: Tailwind defaults are
untouched, so existing utilities keep working.

## Surface colors

Use these instead of raw hex codes. The four surface levels describe
visual depth, not specific components.

| Token | Hex | Typical use |
| --- | --- | --- |
| `bg-surface-0` | `#0b0e14` | Page background, app shell |
| `bg-surface-1` | `#0f131b` | Card and panel background |
| `bg-surface-2` | `#18181b` | Hover state, active tile |
| `bg-surface-3` | `#1f1f23` | Highest-lift surface (modal body) |

Two overlay-specific tokens:

| Token | Hex | Use |
| --- | --- | --- |
| `bg-surface-modal` | `#0b0e14` | Modal / bottom-sheet background |
| `bg-surface-chart` | `#090c11` | Chart plot area |

## Z-index scale

Never pick an arbitrary `z-XX`. Use the closest token; gaps of 10 leave
room for one-off cases without renumbering.

| Token | Utility | Use |
| --- | --- | --- |
| `--z-base` | `z-base` | Default flow |
| `--z-sticky` | `z-sticky` | Sticky element inside a scroll container |
| `--z-header` | `z-header` | App top bar |
| `--z-nav` | `z-nav` | Bottom navigation, sidebar |
| `--z-sheet` | `z-sheet` | Bottom-sheet overlay |
| `--z-overlay` | `z-overlay` | Full-screen scrim |
| `--z-dialog` | `z-dialog` | Modal dialog (highest) |

## Typography floor

The mobile audit established an **11px minimum** for any user-visible
text. This is a policy, not a token: it is enforced by code review and by
`text-[7px]` / `text-[8px]` sweeping, which was done in Phase A.

Recommended scale:

| Purpose | Size | Tailwind |
| --- | --- | --- |
| Micro label (dense tables) | 11px | `text-[11px]` |
| Label / caption | 12px | `text-xs` |
| Body | 13â€“14px | `text-sm` |
| Emphasis / metric | 15â€“16px | `text-base` |
| Heading | 18px | `text-lg` |

## Spacing

No custom tokens. Use the Tailwind scale (`gap-1` â€¦ `gap-4`) and prefer
the smaller end for dense mobile layouts.

## Border radius

No custom tokens. Use `rounded` (4px), `rounded-md` (6px), `rounded-lg`
(8px), `rounded-2xl` (16px). Match the surface depth: higher surfaces use
larger radii.

## Migration policy

- **New code** should prefer surface tokens and z-tokens.
- **Existing code** migrates opportunistically, not in bulk. A raw hex
  value that already matches a token is functionally identical; there is
  no visual change from switching.
- **Adding a new token** requires updating this document. New tokens must
  have a clear use case that cannot be expressed with an existing token.

## Related audits

- UIUX-M-008 (color system): DELAYED badge now has a `marketClosed` variant
- UIUX-M-011 (component consistency): unified `ModalCloseButton`
- UIUX-M-013 (encoding): em-dash mojibake fixed in 4 source files