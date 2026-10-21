import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Stage 6.10.14.15: per-case coverage / denial classification, baseline rules only.
// No changes to firestore.rules. Every case starts its own demo-project Emulator.
const cases = [
  { id: "self-register-platform", focus: "usuarios", pattern: "^user cannot self-register as platform admin$" },
  { id: "self-promote-platform", focus: "usuarios", pattern: "^user cannot promote own profile to platform admin$" },
  { id: "timestamp", focus: "usuarios-validacao", pattern: "^610149 self user updates allowed timestamp$" },
  { id: "promote", focus: "usuarios-validacao", pattern: "^610149 user cannot promote own profile$" },
  { id: "manage-same-company", focus: "usuarios-validacao", pattern: "^610149 company admin manages same-company user$" },
  { id: "deny-other-company", focus: "usuarios-validacao", pattern: "^610149 company admin cannot manage other company$" },
  { id: "platform-invite", focus: "usuarios-validacao", pattern: "^610149 platform admin manages invited company admin$" },
  { id: "deny-ordinary-user", focus: "usuarios-validacao", pattern: "^610149 ordinary user cannot change others privileges$" },
  { id: "admin-self-management", focus: "usuarios-validacao", pattern: "^610149 company admin self-management regression probe$" },
];
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101415");
const results = [];
function getCoverageHotspots(value) {
  // Firestore ruleCoverage JSON can vary across Emulator versions.
  // Emit strictly grounded fields; do not pretend coverage counts prove causality.
  const hits = [];
  const visit = (node, path, depth) => {
    if (depth > 18 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry, i) => visit(entry, path + "[" + i + "]", depth + 1));
      return;
    }
    const e = node;
    const count = typeof e.count === "number" ? e.count :
      typeof e.evaluationCount === "number" ? e.evaluationCount : null;
    if (count !== null && (typeof e.sourcePosition === "object" || typeof e.source === "string" || typeof e.expression === "string")) {
      hits.push({ path, count, sourcePosition: e.sourcePosition ?? null,
        source: typeof e.source === "string" ? e.source.slice(0, 160) : null,
        expression: typeof e.expression === "string" ? e.expression.slice(0, 160) : null });
    }
    for (const [key, child] of Object.entries(e)) if (child && typeof child === "object") visit(child, path + "." + key, depth + 1);
  };
  visit(value, "$", 0);
  return hits.sort((a, b) => b.count - a.count).slice(0, 30);
}
for (const item of cases) {
  const reportPrefix = prefix + "-" + item.id;
  const env = { ...process.env, PATIO_RULES_FOCUS: item.focus,
    PATIO_RULES_TEST_PATTERN: item.pattern, PATIO_RULES_REPORT_PREFIX: reportPrefix };
  delete env.PATIO_RULES_TEST_RULES_PATH;
  delete env.PATIO_RULES_STRICT;
  process.stdout.write("\n=== " + item.id + " / baseline Emulator ===\n");
  const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
  if (run.error) throw run.error;
  const summary = JSON.parse(await readFile(reportPrefix + "-summary.json", "utf8"));
  const log = await readFile(reportPrefix + ".log", "utf8");
  const passed = (log.match(/^ok \d+ - /gm) ?? []).filter(line => !line.includes("# SKIP")).length;
  const failed = (log.match(/^not ok \d+ - /gm) ?? []).length;
  const budget = summary.expressionBudgetMentions;
  const evalErrors = summary.evaluationErrorMentions;
  const matchedCoverage = summary.coverage_json ? JSON.parse(await readFile(summary.coverage_json, "utf8")) : null;
  results.push({
    ...item, exitCode: run.status, testExitCode: summary.testExitCode,
    passed, failed, budget, evaluationErrors: evalErrors,
    denialDiagnostic: budget > 0 ? "expression-budget" : evalErrors > 0 ? "evaluation-error" : "no-error-detected",
    coverageJson: summary.coverage_json ?? null,
    coverageError: summary.coverage_json_error ?? null,
    coverageRootKeys: matchedCoverage && typeof matchedCoverage === "object" ? Object.keys(matchedCoverage) : [],
    topCoverageExpressions: matchedCoverage ? getCoverageHotspots(matchedCoverage) : [],
    summaryPath: reportPrefix + "-summary.json", logPath: reportPrefix + ".log",
  });
}
const report = { stage: "6.10.14.15", emulatorOnly: true,
  officialRulesUnchanged: true, caseCount: cases.length, cases: results,
  notes: [
    "Denial diagnostic is derived from Emulator logs, not proof of rule equivalence.",
    "Coverage counts identify executed expressions; do not establish which helper caused an expression-budget failure.",
    "Inspect raw HTML and JSON coverage along with full logs. No temporary rule candidates or deploy.",
  ],
};
await writeFile(prefix + "-comparison.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write("\n6.10.14.15 SUMMARY\n" + JSON.stringify(results.map(x => ({
  id: x.id, exitCode: x.exitCode, passed: x.passed, failed: x.failed,
  budget: x.budget, evaluationErrors: x.evaluationErrors, denialDiagnostic: x.denialDiagnostic,
})), null, 2) + "\n");
if (results.some(x => x.exitCode !== 0 || x.passed !== 1 || x.failed !== 0)) process.exitCode = 1;
