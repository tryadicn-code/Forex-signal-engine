# Signal Detail Panel — Narrative Redesign

**Status:** design, no code changes yet
**Scope:** mobile Signal Detail Panel (opened from a scanner card)
**Related:** docs/DESIGN-TOKENS.md, UIUX-M-007 (bottom sheet), UIUX-M-010 (KPI filter)

## 1. Problem

The current Signal Detail Panel shows engine output faithfully but is
hard to read for a trader:

- Status is repeated four times in different vocabularies (executive
  summary, inline text, progress bar, execution gates).
- Engine vocabulary (bias_valid, REGIME_MATCH, TREND_PULLBACK) dominates
  the top of the panel where actionable information should live.
- Evidence lists can reach 76 entries and bury the decision context.
- The panel answers "what did the engine compute?" but not "why is
  this signal waiting, and what needs to happen next?".

The fix is to reorder the panel top-to-bottom by user priority: chart,
then a human-language narrative, then the raw engine data collapsed.

## 2. Target structure

The panel becomes a layered document.

### Layer 0 - Chart (always visible, top)
- Same PriceChart component that exists today.
- H1 default timeframe, same M15/H4/D1 tabs.
- Future (out of scope here): overlay setup zone, entry, SL, TP on
  the chart.

### Layer 1 - Hero status (always visible)
- One card with a single-line state and a one-line reason.
- Format:
    STATE
    Reason in plain language

  Examples:
    WATCHING
    Menunggu harga masuk zona supply

    ARMED
    Harga di zona supply, menunggu trigger candle

    BLOCKED
    RR 1.2 di bawah minimum 2.0

    READY
    Entry 1.12250 / SL 1.12550 / TP1 1.11650 (RR 1:2.00)

- No icon. All-caps for the state word; sentence case for the reason.

### Layer 2 - Progress bar (always visible)
- Same horizontal bar that exists today:
    [Bias OK]-[Setup partial]-[Trigger pending]-[Risk pending]-[Execute pending]
- Positioned directly under the hero status card.

### Layer 3 - Narrative sections (always visible)
Four sections, same order as the progress bar. Each section has the
same internal shape:

    HEADER - Status word
    Meta line (score / level / target)
    Body: 1-4 bullets answering "why" or "what is waiting"

#### 3.1 Bias
    BIAS - SHORT
    Score -67 (threshold +/-20)

    Kenapa SHORT:
    - Struktur LH / LL bearish
    - EMA stack bearish, harga di bawah EMA20
    - Regime TREND_DOWN (strength 39)

#### 3.2 Setup
    SETUP - Menunggu harga masuk zona supply
    Harga 1.11959 (+25 pips ke zona 1.12208 - 1.12533)
    Setup score 45 / 60

    Menunggu:
    - Harga naik ke zona supply
    - Skor setup naik +15

#### 3.3 Trigger
    TRIGGER - Belum ada
    Confidence 0 / 80

    Butuh salah satu:
    - Candle rejection di zona supply
    - Close di bawah 1.11855

#### 3.4 Risk
    RISK - Belum dievaluasi
    Akan dihitung setelah trigger confirmed

    (when evaluated)
    RISK - APPROVED
    Entry 1.12250 / SL 1.12550 / TP1 1.11650
    RR 1:2.00 / Risk 0.5% / Size 0.15 lot

### Layer 4 - Raw data (collapsed by default)
- Section title: "Raw data"
- All technical detail lives here, each item is its own collapsible
  disclosure (same pattern as the existing details block on the
  System page):
    > Chart context (timeframe selector, OHLC strip)
    > Multi-timeframe context
    > Signal lifecycle & transitions
    > Execution gates (7 gates)
    > Regime routing
    > Paper execution
    > Evidence & conflicts (grouped, per group 3 + Show all)
    > Data quality
- All collapsed by default. State is session-only, no persistence.
- Multiple can be open at once; no accordion behavior.

## 3. Language rules

- Explanatory sentences: Bahasa Indonesia.
- Established trading terms: English (BIAS, SETUP, TRIGGER, RISK,
  ENTRY, SL, TP, EMA, RSI, REGIME).
- Engine codes in Layer 4 only: UPPER_SNAKE (bias_valid,
  BIAS_STRUCTURE, REGIME_MATCH).

## 4. Data mapping

| UI field | Source | Status |
| --- | --- | --- |
| Hero state | signalState + executionDecision | exists |
| Hero reason | derived from setupState / triggerState | exists |
| Bias score | biasScore | exists |
| Bias label | bias | exists |
| Bias components | evidence[code starts with BIAS_] | exists |
| Setup state | setupState | exists |
| Setup score | setupScore | exists |
| Setup zone bounds | setup engine output | TODO - confirm in Fase A recon |
| Distance to zone | derived from zone bounds | TODO |
| Trigger state | triggerState | exists |
| Trigger confidence | trigger engine output | TODO - confirm in Fase B recon |
| Trigger reference price | derived from structure points | TODO |
| Risk status | riskDetail.approved | exists |
| Risk levels | riskDetail.entryPrice / stopLoss / takeProfit1/2 | exists |
| Risk RR | riskReward | exists |

Items marked TODO are gated on a recon pass when the corresponding
phase starts. If a field is not available on SymbolScanResult, the
narrative line ships in generic form ("Menunggu konfirmasi candle di
timeframe H1") and a separate TRD research item is opened to expose
the data from the engine. The UI change does not block on it.

## 5. Duplicate review (deferred to Fase D)

Nothing is removed in Fase A, B, or C. The items below are candidates
for removal only after Fase C has shipped and been reviewed visually.
Each candidate is judged on evidence, not assumption.

| # | Item | Trigger for removal |
| --- | --- | --- |
| 1 | Executive-summary title "Watching" | Hero card renders same state above it AND visual review confirms redundancy |
| 2 | "Conditions are being monitored..." line | Hero reason subsumes it AND user review confirms |
| 3 | Inline "Setup WATCH / Trigger WAITING" | Progress bar + narrative sections cover it |
| 4 | Grid cell "SIGNAL: WATCH" | Decided after Fase C |
| 5 | Grid cell "PAPER: NO ACTION" | Decided after Fase C |

The grid cells ENGINE (WAIT) and BROKER (Open System) are NOT candidates:
they carry information that appears nowhere else on the panel.

Fase D is not scheduled. It happens only if a visual review after Fase C
confirms the duplication and the user approves each removal.

## 6. Non-goals

- No engine changes. This is a UI restructure over existing
  SymbolScanResult fields.
- No threshold changes (minRR, minTriggerScore, tp2RR, bias weights).
- No new data persisted; localStorage auto-reopen stays removed.
- No chart overlay yet; that is a follow-up task once zone bounds are
  confirmed available.
- No change to desktop (xl:) layout other than inheriting the same
  narrative order; the desktop panel remains sticky on the right.

## 7. Delivery plan

Each phase ends with a **review gate**: the panel is reviewed on a real
device before the next phase starts. Adjust data mapping, wording, or
layout based on what is actually useful. Do not proceed to the next
phase until the user has confirmed the current phase looks correct.

### Fase A - prototype Bias
- New SignalNarrative.tsx component renders the hero card, the
  progress bar (reused), and the BIAS section.
- Placed directly under the chart in signal-detail-panel.tsx.
- All current sections below remain untouched.
- One commit. Review before Fase B.

### Fase B - expand to SETUP / TRIGGER / RISK
- Add the remaining three sections to SignalNarrative.tsx.
- Section renderers use the same header + meta + bullet pattern.
- One commit. Review before Fase C.

### Fase C - wrap the old sections into Layer 4
- Move the existing chart-context strip, MTF, Lifecycle, Execution
  gates, Regime routing, Paper execution, Evidence/Conflicts, and Data
  quality into a details-based "Raw data" group.
- Collapsed by default.
- One commit. Review before considering Fase D.

### Fase D - duplicate removal (conditional)
- Only if Fase C visual review confirms the duplication.
- Remove items from Section 5 one at a time, each with its own commit
  and its own review.

All phases: npm run typecheck, npm run lint, npm test
(93 files / 670 tests, baseline preserved).

## 8. Test plan

- No test file currently asserts Signal Detail Panel internals; the
  existing dashboard test only checks the scanner list.
- Fase A adds one smoke test: given a WATCHING signal, the panel
  renders the hero state, the progress bar, and a Bias section that
  contains the score and at least one reason bullet.
- Fase C adds one smoke test: the "Raw data" group is collapsed by
  default and its content is not in the DOM until expanded.

## 9. Open questions

1. Zone bounds (setup engine): is the upper/lower bound of the
   actionable zone exposed on SymbolScanResult today, or does it need
   a new field? Confirm during Fase A recon.
2. Trigger reference price: is the structural level that would fire a
   trigger exposed, or must it be derived from structure points?
   Confirm during Fase B recon.
3. Trigger confidence: confirm the field name and semantics
   (0-100? probability? score?).

If any of these require new engine fields, the corresponding narrative
line ships in generic form and the field exposure is opened as a
separate TRD research item; the UI change does not block on it.

## 10. Iteration note

This document is a starting point, not a contract. Every phase has a
review gate specifically so the design can be adjusted based on what
actually looks useful on a real device. Further changes are expected.