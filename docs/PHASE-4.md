# FSE Phase 4 — Paper Trading

Phase 4 adds a deterministic paper-trading layer on top of the locked Phase 1–3 signal pipeline.

Core boundary:

```
FSE decides -> Paper Trading simulates -> Analytics measures -> UI reports
```

The paper layer must never create or reinterpret trading signals. Only an upstream `EXECUTE` decision may be consumed, and repeated scanner refreshes must remain idempotent.

Implementation status is tracked on branch `phase-4-paper-trading`.
