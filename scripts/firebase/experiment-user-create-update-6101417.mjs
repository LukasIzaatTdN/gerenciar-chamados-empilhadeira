import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Stage 6.10.14.17: determine whether CREATE or UPDATE contributes to negative
// cases. These temporary variants DISABLE permissions and MUST NEVER be deployed.
const original = await readFile("firestore.rules", "utf8");
const matchStart = original.indexOf("    match /usuarios/{id} {");
const matchEnd = original.indexOf("      match /push_tokens/{deviceId} {", matchStart);
if (matchStart < 0 || matchEnd < matchStart) throw new Error("usuarios match anchors unavailable");
const block = original.slice(matchStart, matchEnd);
const createStart = block.indexOf("      allow create: if ");
const updateStart = block.indexOf("      // Reject self-promotion", createStart);
const deleteStart = block.indexOf("      allow delete: if ", updateStart);
if (createStart < 0 || updateStart < createStart || deleteStart < updateStart) throw new Error("Unexpected rule structure");
const variants = [
  ["baseline", null],
  ["create-denied", block.slice(0, createStart) + "      allow create: if false;\n\n" + block.slice(updateStart)],
  ["update-denied", block.slice(0, updateStart) + "      allow update: if false;\n\n" + block.slice(deleteStart)],
];
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101417-"));
const files = [];
for (const [name, modified] of variants) {
  if (modified === null) { files.push([name, null]); continue; }
  const path = join(dir, name + ".rules");
  await writeFile(path, original.slice(0, matchStart) + modified + original.slice(matchEnd));
  files.push([name, path]);
}
const cases = [
  { id: "create-platform", focus: "usuarios", pattern: "^user cannot self-register as platform admin$", operation: "create", expected: "deny" },
  { id: "update-self-promotion", focus: "usuarios", pattern: "^user cannot promote own profile to platform admin$", operation: "update", expected: "deny" },
  { id: "update-other-company", focus: "usuarios-validacao", pattern: "^610149 company admin cannot manage other company$", operation: "update", expected: "deny" },
  { id: "update-ordinary-user", focus: "usuarios-validacao", pattern: "^610149 ordinary user cannot change others privileges$", operation: "update", expected: "deny" },
  { id: "update-company-admin-self", focus: "usuarios-validacao", pattern: "^610149 company admin self-management regression probe$", operation: "update", expected: "allow" },
  { id: "update-company-admin-other", focus: "usuarios-validacao", pattern: "^610149 company admin manages same-company user$", operation: "update", expected: "allow" },
];
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101417");
const results = {};
for (const [variant, rulesPath] of files) {
  results[variant] = {};
  for (const test of cases) {
    const outputPrefix = prefix + "-" + variant + "-" + test.id;
    const env = { ...process.env, PATIO_RULES_FOCUS: test.focus,
      PATIO_RULES_TEST_PATTERN: test.pattern, PATIO_RULES_REPORT_PREFIX: outputPrefix };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (rulesPath) env.PATIO_RULES_TEST_RULES_PATH = rulesPath;
    process.stdout.write("\n=== " + variant + " / " + test.id + " ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(outputPrefix + "-summary.json", "utf8"));
    const log = await readFile(outputPrefix + ".log", "utf8");
    const outcomes = [...log.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)]
      .filter(match => !match[2].includes("# SKIP"));
    const statuses = outcomes.map(match => match[1]);
    results[variant][test.id] = {
      operation: test.operation, expected: test.expected,
      exitCode: run.status, testExitCode: summary.testExitCode,
      passed: statuses.filter(x => x === "ok").length,
      failed: statuses.filter(x => x === "not ok").length,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      hasExplicitDenied: log.includes("PERMISSION_DENIED"),
      testNotRun: statuses.length !== 1,
      summary: outputPrefix + "-summary.json", log: outputPrefix + ".log",
      coverageJson: summary.coverage_json ?? null,
    };
  }
}
const report = {
  stage: "6.10.14.17", emulatorOnly: true, officialRulesUnchanged: true,
  diagnosticOnly: true, deployableCandidates: [],
  variants: Object.fromEntries(files.slice(1)), results,
  notes: [
    "create-denied and update-denied intentionally remove authorization; they are NEVER deployment candidates.",
    "Observe that a disabled branch will DENY legitimate operations as expected; do not interpret passing negatives as a safe rule.",
    "A passing assertFails can mask errors, including budget exhaustion. Review individual logs and coverage.",
    "This test separates create and update expression effects; it does not prove whether the Emulator is correct.",
  ],
};
await writeFile(prefix + "-comparison.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write("\nRESULTS\n" + JSON.stringify(Object.fromEntries(
  Object.entries(results).map(([variant, entries]) => [variant, Object.fromEntries(
    Object.entries(entries).map(([id, v]) => [id, { pass: v.passed, fail: v.failed, budget: v.expressionBudgetMentions, evaluationErrors: v.evaluationErrorMentions }])
  )])
), null, 2) + "\n");
if (Object.values(results.baseline).some(x => x.exitCode !== 0 || x.testNotRun))
  process.exitCode = 1;
