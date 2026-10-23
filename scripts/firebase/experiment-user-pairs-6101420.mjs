import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.20 — diagnostics only. Extract the three ORIGINAL update branches,
// retain global guards and compare each PAIR of branches.
// Pair-restricted rules deliberately deny some legitimate operations. NEVER DEPLOY.
const rules = await readFile("firestore.rules", "utf8");
const matchStart = rules.indexOf("    match /usuarios/{id} {");
const updateStart = rules.indexOf("      allow update: if isSignedIn()", matchStart);
const updateEnd = rules.indexOf("      allow delete:", updateStart);
if ([matchStart, updateStart, updateEnd].some(x => x < 0) || updateEnd <= updateStart)
  throw new Error("Unexpected usuarios.update match boundaries");
const updateBlock = rules.slice(updateStart, updateEnd);
const firstBranch = updateBlock.indexOf("          (\n          isSignedIn()");
const splitToken = "\n        || (";
const splitA = updateBlock.indexOf(splitToken, firstBranch);
const splitB = updateBlock.indexOf(splitToken, splitA + splitToken.length);
const tail = updateBlock.lastIndexOf("\n        );");
if ([firstBranch, splitA, splitB, tail].some(x => x < 0) ||
  !(firstBranch < splitA && splitA < splitB && splitB < tail) ||
  updateBlock.indexOf(splitToken, splitB + splitToken.length) !== -1)
  throw new Error("Cannot safely isolate exactly three update branches");
const head = updateBlock.slice(0, firstBranch);
const branches = [
  updateBlock.slice(firstBranch, splitA).trim(),
  ("(" + updateBlock.slice(splitA + splitToken.length, splitB)).trim(),
  ("(" + updateBlock.slice(splitB + splitToken.length, tail)).trim(),
];
if (branches.some(b => !b.startsWith("(") || !b.endsWith(")")))
  throw new Error("Unexpected branch parentheses; abort instead of generating malformed rules");

const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101420-"));
const variants = [["baseline", null]];
for (const [name, indices] of [["self-platform", [0, 1]], ["self-company", [0, 2]], ["platform-company", [1, 2]]]) {
  const changed = head + "          " + indices.map(index => branches[index]).join("\n        || ") + updateBlock.slice(tail);
  const file = join(dir, name + ".rules");
  await writeFile(file, rules.slice(0, updateStart) + changed + rules.slice(updateEnd));
  variants.push([name, file]);
}
const tests = [
  { id: "create-platform", focus: "usuarios", pattern: "^user cannot self-register as platform admin$", expected: "deny" },
  { id: "self-promote-1", focus: "usuarios", pattern: "^user cannot promote own profile to platform admin$", expected: "deny" },
  { id: "self-timestamp", focus: "usuarios-validacao", pattern: "^610149 self user updates allowed timestamp$", expected: "allow" },
  { id: "self-promote-2", focus: "usuarios-validacao", pattern: "^610149 user cannot promote own profile$", expected: "deny" },
  { id: "company-manages", focus: "usuarios-validacao", pattern: "^610149 company admin manages same-company user$", expected: "allow" },
  { id: "company-cross-tenant", focus: "usuarios-validacao", pattern: "^610149 company admin cannot manage other company$", expected: "deny" },
  { id: "platform-invite", focus: "usuarios-validacao", pattern: "^610149 platform admin manages invited company admin$", expected: "allow" },
  { id: "ordinary-user", focus: "usuarios-validacao", pattern: "^610149 ordinary user cannot change others privileges$", expected: "deny" },
  { id: "company-self-status", focus: "usuarios-validacao", pattern: "^610149 company admin self-management regression probe$", expected: "allow" },
];
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101420");
const report = {
  stage: "6.10.14.20", emulatorOnly: true, officialRulesUnchanged: true,
  deployableCandidates: [], temporaryRulesDirectory: dir,
  warning: "Pair-only rules deliberately deny some legitimate writes. A passing assertFails may hide budget/evaluation errors. NEVER DEPLOY.",
  scenarios: tests.map(({id, expected}) => ({id, expected})), variants: {},
};
for (const [name, path] of variants) {
  report.variants[name] = {};
  for (const test of tests) {
    const outputPrefix = prefix + "-" + name + "-" + test.id;
    const env = {
      ...process.env, PATIO_RULES_FOCUS: test.focus,
      PATIO_RULES_TEST_PATTERN: test.pattern,
      PATIO_RULES_REPORT_PREFIX: outputPrefix,
    };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (path) env.PATIO_RULES_TEST_RULES_PATH = path;
    process.stdout.write("\n=== " + name + " / " + test.id + " ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    let summary;
    try { summary = JSON.parse(await readFile(outputPrefix + "-summary.json", "utf8")); }
    catch (error) { summary = { diagnosticError: String(error) }; }
    const log = await readFile(outputPrefix + ".log", "utf8").catch(() => "");
    const outcomes = [...log.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)]
      .filter(m => !m[2].includes("# SKIP"));
    report.variants[name][test.id] = {
      expected: test.expected, exitCode: run.status,
      selectedCaseCount: outcomes.length,
      passed: outcomes.filter(m => m[1] === "ok").length,
      failed: outcomes.filter(m => m[1] === "not ok").length,
      expressionBudgetMentions: summary.expressionBudgetMentions ?? null,
      evaluationErrorMentions: summary.evaluationErrorMentions ?? null,
      byRule: summary.byRule ?? null,
      budgetByRule: summary.budgetByRule ?? null,
      error: summary.diagnosticError ?? null,
      log: outputPrefix + ".log", summary: outputPrefix + "-summary.json",
    };
  }
}
const rows = tests.map(({id,expected}) => ({
  id, expected, ...Object.fromEntries(variants.map(([name]) =>
    [name, report.variants[name][id]])),
}));
report.rows = rows;
report.baselineHealthy = rows.every(x =>
  x.baseline.exitCode === 0 && x.baseline.selectedCaseCount === 1 &&
  x.baseline.passed === 1);
await writeFile(prefix + "-comparison.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write("\nSUMMARY\n" + JSON.stringify(rows.map(row => ({
  id: row.id, expected: row.expected, variants: Object.fromEntries(
    variants.map(([v]) => [v, {
      passed: row[v].passed, failed: row[v].failed,
      budgets: row[v].expressionBudgetMentions,
      errors: row[v].evaluationErrorMentions,
    }])
  ),
})), null, 2) + "\n");
if (!report.baselineHealthy) process.exitCode = 1;
