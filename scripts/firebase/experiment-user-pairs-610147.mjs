import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// 6.10.14.7: Diagnostic branch isolation. Generated rules are NEVER deployable.
const original = await readFile("firestore.rules", "utf8");
const start = original.indexOf("      // Reject self-promotion before any self-update or admin-management branch.");
const end = original.indexOf("      allow delete:", start);
if (start < 0 || end < 0 || end <= start) throw new Error("usuarios update block not found");
const block = original.slice(start, end);
const branches = {
  self: '          isSignedIn()\n          && request.auth.uid == id\n          && request.resource.data.id == resource.data.id',
  platform: '          resource.data.perfil == "Administrador da Empresa"\n          && request.resource.data.perfil == resource.data.perfil',
  company: '          resource.data.perfil != "Administrador Geral"\n          && request.resource.data.perfil != "Administrador Geral"',
};
for (const [name, anchor] of Object.entries(branches)) {
  if (block.split(anchor).length !== 2) throw new Error("Expected unique " + name + " branch anchor");
}
const dir = await mkdtemp(join(tmpdir(), "patio-rules-610147-"));
const variants = {};
const pairs = [
  ["self", "platform"],
  ["self", "company"],
  ["platform", "company"],
];
for (const keep of pairs) {
  let edited = block;
  for (const [name, anchor] of Object.entries(branches)) {
    if (!keep.includes(name)) edited = edited.replace(anchor, "          false\n          && " + anchor.trimStart());
  }
  const path = join(dir, "pair-" + keep.join("-") + ".rules");
  await writeFile(path, original.slice(0, start) + edited + original.slice(end));
  variants[keep.join("-")] = path;
}
const prefix = resolve(process.env.PATIO_RULES_EXPERIMENT_PREFIX || "/tmp/patio-rules-610147");
const cases = [
  { name: "baseline", path: null },
  ...Object.entries(variants).map(([name, path]) => ({ name: "pair-" + name, path })),
];
const summaries = {};
for (const item of cases) {
  const env = {
    ...process.env,
    PATIO_RULES_FOCUS: "usuarios",
    PATIO_RULES_REPORT_PREFIX: prefix + "-" + item.name,
  };
  delete env.PATIO_RULES_TEST_RULES_PATH;
  delete env.PATIO_RULES_STRICT;
  if (item.path) env.PATIO_RULES_TEST_RULES_PATH = item.path;
  process.stdout.write("\n=== " + item.name + " (emulator only) ===\n");
  const run = spawnSync("npm", ["run", "test:rules:diagnose"], { env, stdio: "inherit" });
  if (run.error) throw run.error;
  const report = prefix + "-" + item.name + "-summary.json";
  summaries[item.name] = JSON.parse(await readFile(report, "utf8"));
  if (run.status !== 0 || summaries[item.name].testExitCode !== 0) {
    throw new Error(item.name + " failed. Inspect " + report);
  }
}
const comparison = {
  stage: "6.10.14.7",
  emulatorOnly: true,
  officialRulesUnchanged: true,
  isolatedNegativeTestsOnly: true,
  pairs: pairs.map(pair => pair.join("+")),
  variants,
  results: Object.fromEntries(Object.entries(summaries).map(([name, s]) => [name, {
    testExitCode: s.testExitCode,
    evaluationErrorMentions: s.evaluationErrorMentions,
    expressionBudgetMentions: s.expressionBudgetMentions,
    budgetByCategory: s.budgetByCategory,
  }])),
  warning: "One branch is intentionally disabled in each variant. Never deploy variants. Negative tests do not establish that legitimate updates still work.",
};
await writeFile(prefix + "-comparison.json", JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write("\nEXPERIMENT COMPARISON " + JSON.stringify(comparison, null, 2) + "\n");
