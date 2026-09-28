const fs = require("fs");
const p1 = "src/server/scanner-access.ts";
let t1 = fs.readFileSync(p1, "utf8");
if (!t1.includes('import { isTerminalState } from "@/lib/signal-meta";')) {
  t1 = t1.replace(
    'import { DEMO_SCENARIOS } from "@/config/demo-scenarios";',
    'import { DEMO_SCENARIOS } from "@/config/demo-scenarios";\nimport { isTerminalState } from "@/lib/signal-meta";'
  );
  fs.writeFileSync(p1, t1);
  console.log("patched scanner-access import");
} else {
  console.log("scanner-access import already present");
}
const p2 = "src/lib/scanner-query.ts";
let t2 = fs.readFileSync(p2, "utf8");
t2 = t2.replace(
  "function sortValue(result: SymbolScanResult, key: SortKey): number | string {",
  "function sortValue(result: SymbolScanResult, key: SortKey): number | string | null {"
);
t2 = t2.replace("      return typed[key] as number | null;", "      return typed[key];");
fs.writeFileSync(p2, t2);
console.log("patched scanner-query sortValue");
