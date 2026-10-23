import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Stage 6.10.14.18: comparison only. An explicit document-existence guard
// on UPDATE is a diagnostic control, not a security fix or deployable candidate.
const original = await readFile("firestore.rules", "utf8");
const match = original.indexOf("    match /usuarios/{id} {");
const update = original.indexOf("      allow update: if isSignedIn()", match);
const deletion = original.indexOf("      allow delete:", update);
if (match < 0 || update < match || deletion < update) throw new Error("Unexpected usuarios rules structure");
const oldUpdate = original.slice(update, deletion);
const guard = "      allow update: if exists(/databases/$(database)/documents/usuarios/$(id))\n        && isSignedIn()";
if (!oldUpdate.startsWith("      allow update: if isSignedIn()")) throw new Error("Unexpected update entry expression");
const guardedRules = original.slice(0, update) +
  oldUpdate.replace("      allow update: if isSignedIn()", guard) +
  original.slice(deletion);
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101418-"));
const guardedPath = join(dir, "update-exists-guard.rules");
await writeFile(guardedPath, guardedRules);

const patterns = [
  ["setdoc-absent-allowed", "^6101418 setDoc on absent ordinary user is allowed create$"],
  ["setdoc-absent-platform-denied", "^6101418 setDoc on absent platform admin is denied$"],
  ["setdoc-existing-escalation", "^6101418 setDoc on existing own user cannot escalate$"],
  ["updatedoc-existing-escalation", "^6101418 updateDoc on existing own user cannot escalate$"],
  ["updatedoc-absent-denied", "^6101418 updateDoc on absent user is denied$"],
  ["updatedoc-existing-allowed", "^6101418 updateDoc on existing own user timestamp is allowed$"],
];
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101418");
const results = {};
for (const [variant, rulesPath] of [["baseline", null], ["update-exists-guard", guardedPath]]) {
  results[variant] = {};
  for (const [id, pattern] of patterns) {
    const outputPrefix = prefix + "-" + variant + "-" + id;
    const env = {
      ...process.env,
      PATIO_RULES_FOCUS: "usuarios-operacoes-6101418",
      PATIO_RULES_TEST_PATTERN: pattern,
      PATIO_RULES_REPORT_PREFIX: outputPrefix,
    };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (rulesPath) env.PATIO_RULES_TEST_RULES_PATH = rulesPath;
    process.stdout.write("\n=== " + variant + " / " + id + " ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const summary = JSON.parse(await readFile(outputPrefix + "-summary.json", "utf8"));
    const log = await readFile(outputPrefix + ".log", "utf8");
    const outcomes = [...log.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)].filter(x => !x[2].includes("# SKIP"));
    results[variant][id] = {
      exitCode: run.status,
      passed: outcomes.filter(x => x[1] === "ok").length,
      failed: outcomes.filter(x => x[1] === "not ok").length,
      selectedCaseCount: outcomes.length,
      expressionBudgetMentions: summary.expressionBudgetMentions,
      evaluationErrorMentions: summary.evaluationErrorMentions,
      errorByRule: summary.byRule,
      budgetByRule: summary.budgetByRule,
      log: outputPrefix + ".log", summary: outputPrefix + "-summary.json",
    };
  }
}
const rows = patterns.map(([id]) => ({
  id,
  baseline: results.baseline[id],
  guarded: results["update-exists-guard"][id],
}));
const report = {
  stage: "6.10.14.18",
  emulatorOnly: true, officialRulesUnchanged: true,
  candidateApproved: false, deployableCandidates: [],
  guardRulesPath: guardedPath, cases: rows,
  observations: [
    "setDoc on an absent doc is create; setDoc on an existing doc is update.",
    "An absent document might trigger UPDATE evaluation diagnostics without meaning that an UPDATE was authorized.",
    "assertFails may hide evaluation errors or expression budget exhaustion. Inspect logs and coverage, not just exit codes.",
    "The guard can introduce additional evaluations or alter behavior; never deploy without extensive authorization regression tests.",
  ],
};
await writeFile(prefix + "-comparison.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write("\nCOMPARISON\n" + JSON.stringify(rows.map(({id,baseline,guarded}) => ({
  id, passBefore: baseline.passed, passAfter: guarded.passed,
  budgetBefore: baseline.expressionBudgetMentions, budgetAfter: guarded.expressionBudgetMentions,
  errorsBefore: baseline.evaluationErrorMentions, errorsAfter: guarded.evaluationErrorMentions,
})), null, 2) + "\n");
if (rows.some(x => x.baseline.exitCode !== 0 || x.guarded.exitCode !== 0 ||
  x.baseline.selectedCaseCount !== 1 || x.guarded.selectedCaseCount !== 1)) {
  process.exitCode = 1;
}
