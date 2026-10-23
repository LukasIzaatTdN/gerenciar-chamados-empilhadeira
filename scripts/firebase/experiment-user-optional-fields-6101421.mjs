import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.21: isolate optional-field reads ONLY inside usuarios.update.
// These variants may change behavior; this experiment does not approve deployment.
const rules = await readFile("firestore.rules", "utf8");
const matchStart = rules.indexOf("    match /usuarios/{id} {");
const updateStart = rules.indexOf("      allow update: if isSignedIn()", matchStart);
const updateEnd = rules.indexOf("      allow delete:", updateStart);
if ([matchStart, updateStart, updateEnd].some(x => x < 0) || updateEnd <= updateStart)
  throw new Error("Unexpected usuarios.update boundaries");
const originalUpdate = rules.slice(updateStart, updateEnd);
const optionalReads = {
  store: [
    ["request.resource.data.supermercado_id", 'request.resource.data.get("supermercado_id", null)'],
    ["resource.data.supermercado_id", 'resource.data.get("supermercado_id", null)'],
  ],
  invite: [
    ["request.resource.data.convite_token", 'request.resource.data.get("convite_token", null)'],
    ["resource.data.convite_token", 'resource.data.get("convite_token", null)'],
  ],
};
// Replace longer prefixes first so resource.data is not accidentally replaced
// inside request.resource.data. Anchor exact counts to prevent silent changes.
function applyReads(updateText, groups) {
  let changed = updateText;
  const replaced = {};
  for (const group of groups) {
    for (const [from, to] of optionalReads[group]) {
      const matches = changed.split(from).length - 1;
      if (matches === 0) throw new Error("Expected optional read missing: " + from);
      changed = changed.split(from).join(to);
      replaced[from] = matches;
    }
  }
  return { text: changed, replaced };
}
const dir = await mkdtemp(join(tmpdir(), "patio-rules-6101421-"));
const variants = [["baseline", null]];
const edits = {};
for (const [name, groups] of [["safe-store", ["store"]], ["safe-invite", ["invite"]], ["safe-both", ["store", "invite"]]]) {
  const adjusted = applyReads(originalUpdate, groups);
  const file = join(dir, name + ".rules");
  await writeFile(file, rules.slice(0, updateStart) + adjusted.text + rules.slice(updateEnd));
  variants.push([name, file]);
  edits[name] = adjusted.replaced;
}
const cases = [
  ["create-platform", "usuarios", "^user cannot self-register as platform admin$", "deny"],
  ["self-promote-1", "usuarios", "^user cannot promote own profile to platform admin$", "deny"],
  ["self-timestamp", "usuarios-validacao", "^610149 self user updates allowed timestamp$", "allow"],
  ["self-promote-2", "usuarios-validacao", "^610149 user cannot promote own profile$", "deny"],
  ["company-manages", "usuarios-validacao", "^610149 company admin manages same-company user$", "allow"],
  ["company-cross-tenant", "usuarios-validacao", "^610149 company admin cannot manage other company$", "deny"],
  ["platform-invite", "usuarios-validacao", "^610149 platform admin manages invited company admin$", "allow"],
  ["ordinary-user", "usuarios-validacao", "^610149 ordinary user cannot change others privileges$", "deny"],
  ["company-self-status", "usuarios-validacao", "^610149 company admin self-management regression probe$", "allow"],
  ["optional-self-no-store", "usuarios-campos-6101421", "^6101421 own timestamp without supermercado_id$", "allow"],
  ["optional-company-no-invite", "usuarios-campos-6101421", "^6101421 company admin cannot modify other company admin without invite token$", "deny"],
  ["optional-platform-no-invite", "usuarios-campos-6101421", "^6101421 platform admin cannot manage admin without invite token$", "deny"],
  ["optional-company-no-store", "usuarios-campos-6101421", "^6101421 company admin cannot escalate worker without supermercado_id$", "deny"],
];
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-6101421");
const report = {
  stage: "6.10.14.21", emulatorOnly: true, officialRulesUnchanged: true,
  diagnosticOnly: true, deployableCandidates: [], temporaryRulesDirectory: dir,
  fieldReplacements: edits, results: {},
  caution: "Passing assertFails is not proof of clean denial. Count errors and budgets, inspect logs. Required fields were deliberately not changed.",
};
for (const [variant, rulesPath] of variants) {
  report.results[variant] = {};
  for (const [id, focus, pattern, expected] of cases) {
    const out = prefix + "-" + variant + "-" + id;
    const env = { ...process.env, PATIO_RULES_FOCUS: focus,
      PATIO_RULES_TEST_PATTERN: pattern, PATIO_RULES_REPORT_PREFIX: out };
    delete env.PATIO_RULES_TEST_RULES_PATH;
    delete env.PATIO_RULES_STRICT;
    if (rulesPath) env.PATIO_RULES_TEST_RULES_PATH = rulesPath;
    process.stdout.write("\n=== " + variant + " / " + id + " ===\n");
    const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
    if (run.error) throw run.error;
    const log = await readFile(out + ".log", "utf8").catch(() => "");
    let summary;
    try { summary = JSON.parse(await readFile(out + "-summary.json", "utf8")); }
    catch (error) { summary = { diagnosticError: String(error) }; }
    const outcomes = [...log.matchAll(/^(ok|not ok) \d+ - (.+)$/gm)]
      .filter(m => !m[2].includes("# SKIP"));
    report.results[variant][id] = {
      expected, exitCode: run.status,
      selectedCaseCount: outcomes.length,
      passed: outcomes.filter(x => x[1] === "ok").length,
      failed: outcomes.filter(x => x[1] === "not ok").length,
      expressionBudgetMentions: summary.expressionBudgetMentions ?? null,
      evaluationErrorMentions: summary.evaluationErrorMentions ?? null,
      byRule: summary.byRule ?? null, budgetByRule: summary.budgetByRule ?? null,
      error: summary.diagnosticError ?? null,
      log: out + ".log", summary: out + "-summary.json",
    };
  }
}
report.baselineTestPass = cases.every(([id]) => {
  const x = report.results.baseline[id];
  return x.passed === 1 && x.failed === 0 && x.exitCode === 0 && x.selectedCaseCount === 1;
});
report.variantsPassingAllTests = Object.fromEntries(variants.map(([name]) => [
  name, cases.every(([id]) => {
    const x = report.results[name][id];
    return x.passed === 1 && x.failed === 0 && x.exitCode === 0 && x.selectedCaseCount === 1;
  }),
]));
await writeFile(prefix + "-comparison.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write("\nCOMPARISON\n" + JSON.stringify(Object.fromEntries(variants.map(([name]) => [
  name, {
    passed: Object.values(report.results[name]).filter(x => x.passed === 1 && x.failed === 0).length,
    budgets: Object.values(report.results[name]).reduce((n,x) => n + (x.expressionBudgetMentions ?? 0), 0),
    errors: Object.values(report.results[name]).reduce((n,x) => n + (x.evaluationErrorMentions ?? 0), 0),
  },
])), null, 2) + "\n");
if (!report.baselineTestPass) process.exitCode = 1;
